import { useNavigate, useSearchParams } from 'react-router';
import { BottomBar } from '../components/BottomBar';
import { FodaChip } from '../components/FodaChip';
import { PmBar } from '../components/PmBar';
import { SubfactorFila } from '../components/SubfactorFila';
import type { CalculoImportancia, Catalogo, EvaluacionDetalle } from '../datos/tipos';
import { useEvaluacionCargada, useIdEvaluacion } from '../evaluacion/consultas';
import {
  detalleSubfactores,
  type DetalleSubfactores,
  type FilaFactor,
} from '../evaluacion/derivar';
import { rutaDeEvaluacion } from '../evaluacion/historial';
import { pasosDeEvaluacion, situacionDePasos } from '../evaluacion/pasos';
import { useValoracionFactores } from '../evaluacion/useValoracionFactores';
import { IMPORTANCIA, type Cumplimiento } from '../guios-core';
import { EncabezadoEvaluacion } from './EncabezadoEvaluacion';
import { EstadoCarga } from './EstadoCarga';
import { EstadoGuardado } from './EstadoGuardado';
import { MarcoDecisor } from './MarcoDecisor';

/** P-05: subfactores, pasos 3 y 4 (HU-04, HU-05). Un clic por subfactor, autoguardado y PM en vivo. */
export function SubfactoresPage() {
  const carga = useEvaluacionCargada(useIdEvaluacion());
  if (carga.estado !== 'lista') {
    return (
      <MarcoDecisor>
        <EstadoCarga carga={carga} />
      </MarcoDecisor>
    );
  }
  return (
    <PanelSubfactores
      key={carga.evaluacion.id}
      evaluacion={carga.evaluacion}
      calculo={carga.calculo}
      catalogo={carga.catalogo}
    />
  );
}

interface PanelSubfactoresProps {
  evaluacion: EvaluacionDetalle;
  calculo: CalculoImportancia;
  catalogo: Catalogo;
}

function PanelSubfactores({ evaluacion, calculo, catalogo }: PanelSubfactoresProps) {
  const navegar = useNavigate();
  const [parametros, fijarParametros] = useSearchParams();
  const { filas, valoraciones, cambiarCumplimiento, estado, error, esperarGuardado } =
    useValoracionFactores(evaluacion.id, catalogo, calculo, evaluacion.valoraciones);
  const finalizada = evaluacion.estado === 'finalizada';
  const tieneSoftware = evaluacion.contexto.software.nombre.trim() !== '';
  const situacion = situacionDePasos(filas, tieneSoftware, finalizada);

  const factores = new Map(catalogo.dimensiones.flatMap((d) => d.factores).map((f) => [f.id, f]));
  const relevantes = filas.filter((fila) => fila.relevante);
  const detalles = new Map(
    relevantes.flatMap((fila) => {
      const factor = factores.get(fila.idFactor);
      return factor
        ? [
            [
              fila.idFactor,
              detalleSubfactores(factor, catalogo.subfactores, valoraciones.get(fila.idFactor)),
            ] as const,
          ]
        : [];
    }),
  );
  // El factor de ?factor= si es relevante; si no, el primero relevante.
  const pedido = Number(parametros.get('factor'));
  const actual = relevantes.find((fila) => fila.idFactor === pedido) ?? relevantes[0];
  const detalleActual = actual && detalles.get(actual.idFactor);

  async function verResultados() {
    if (await esperarGuardado()) void navegar(rutaDeEvaluacion(evaluacion.id, 'resultados'));
  }

  const barra = (
    <BottomBar
      onAtras={() => void navegar(rutaDeEvaluacion(evaluacion.id, 'factores'))}
      {...(finalizada
        ? {}
        : { etiquetaSecundaria: 'Guardar borrador', onSecundaria: () => void esperarGuardado() })}
      etiquetaPrincipal="Ver resultados"
      onPrincipal={() => void verResultados()}
    >
      <EstadoGuardado estado={estado} />
    </BottomBar>
  );

  return (
    <MarcoDecisor barraInferior={barra}>
      <EncabezadoEvaluacion
        idEvaluacion={evaluacion.id}
        titulo={evaluacion.contexto.titulo}
        descripcion="Indica en qué medida el software cumple cada subfactor. Se guarda solo y la ponderación se actualiza al instante."
        nombreCalculo={calculo.nombre}
        pasos={pasosDeEvaluacion(situacion)}
        actual="subfactores"
      />
      {finalizada && (
        <div className="alerta alerta--info">
          Esta evaluación está finalizada y no se puede editar.
        </div>
      )}
      {error && (
        <div role="alert" className="alerta alerta--error">
          No se pudo guardar la valoración: {error} Se restauró el valor anterior.
        </div>
      )}

      {!actual || !detalleActual ? (
        <div className="alerta alerta--info">
          Ningún factor es relevante: no hay subfactores que valorar. Revisa la importancia de los
          factores en el paso anterior.
        </div>
      ) : (
        <div className="subfactores">
          <nav className="subfactores__lista tarjeta" aria-label="Factores relevantes">
            {relevantes.map((fila) => (
              <ItemFactor
                key={fila.idFactor}
                fila={fila}
                valorados={detalles.get(fila.idFactor)?.valorados ?? 0}
                actual={fila.idFactor === actual.idFactor}
                onElegir={() =>
                  fijarParametros({ factor: String(fila.idFactor) }, { replace: true })
                }
              />
            ))}
          </nav>
          <DetalleFactor
            fila={actual}
            detalle={detalleActual}
            deshabilitado={finalizada}
            onCambiar={(idSubfactor, ps) => cambiarCumplimiento(actual.idFactor, idSubfactor, ps)}
          />
        </div>
      )}
    </MarcoDecisor>
  );
}

const faltan = (n: number) => (n === 1 ? 'falta 1 subfactor' : `faltan ${n} subfactores`);

interface DetalleFactorProps {
  fila: FilaFactor;
  detalle: DetalleSubfactores;
  deshabilitado: boolean;
  onCambiar: (idSubfactor: number, ps: Cumplimiento) => void;
}

/** Subfactores de un factor, con su PM en vivo: parcial mientras falten, con FODA al completarse. */
function DetalleFactor({ fila, detalle, deshabilitado, onCambiar }: DetalleFactorProps) {
  const evaluado = fila.estado === 'evaluado';
  const pendientes = detalle.total - detalle.valorados;
  return (
    <section className="subfactores__detalle tarjeta" aria-labelledby="factor-actual">
      <div className="tarjeta__cabecera">
        <div>
          <h2 id="factor-actual">{fila.nombre}</h2>
          <div className="factor-fila__meta">
            <span className="chip">{fila.dimension}</span>
            <span className="chip">{fila.alcance}</span>
            {fila.ir !== null && (
              <span className="chip chip--marino">
                Importancia relativa: {IMPORTANCIA[fila.ir]}
              </span>
            )}
          </div>
        </div>
        <span className="ayuda-texto">
          {detalle.valorados}/{detalle.total} valorados
        </span>
      </div>

      <section className="subfactores__pm" aria-label="Ponderación del factor">
        <PmBar
          valor={evaluado ? fila.pm : detalle.pmParcial}
          parcial={!evaluado && detalle.valorados > 0}
          foda={fila.foda}
        />
        {pendientes > 0 && (
          <p className="ayuda-texto">
            <b>Pendiente: {faltan(pendientes)}</b>. Sin todos los subfactores el factor no se
            clasifica ni cuenta para la recomendación.
          </p>
        )}
      </section>

      {detalle.subfactores.map((subfactor, indice) => (
        <SubfactorFila
          key={subfactor.id}
          numero={indice + 1}
          enunciado={subfactor.enunciado}
          valor={subfactor.ps}
          deshabilitado={deshabilitado}
          onCambiar={(ps) => onCambiar(subfactor.id, ps)}
        />
      ))}
    </section>
  );
}

interface ItemFactorProps {
  fila: FilaFactor;
  valorados: number;
  actual: boolean;
  onElegir: () => void;
}

function ItemFactor({ fila, valorados, actual, onElegir }: ItemFactorProps) {
  return (
    <button
      type="button"
      className="subfactores__item"
      aria-current={actual ? 'true' : undefined}
      onClick={onElegir}
    >
      <span className="subfactores__item-nombre">{fila.nombre}</span>
      <span className="ayuda-texto">
        {valorados}/{fila.totalSubfactores}
      </span>
      {fila.estado === 'evaluado' ? (
        <FodaChip foda={fila.foda} />
      ) : (
        <span className="chip">Pendiente</span>
      )}
    </button>
  );
}
