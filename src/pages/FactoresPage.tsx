import { useNavigate } from 'react-router';
import { BottomBar } from '../components/BottomBar';
import { FactorFila } from '../components/FactorFila';
import type { CalculoImportancia, Catalogo, EvaluacionDetalle } from '../datos/tipos';
import { useEvaluacionCargada, useIdEvaluacion } from '../evaluacion/consultas';
import { textoAyudaImportanciaSugerida } from '../evaluacion/derivar';
import { rutaDeEvaluacion } from '../evaluacion/historial';
import { pasosDeEvaluacion, situacionDePasos } from '../evaluacion/pasos';
import { useValoracionFactores } from '../evaluacion/useValoracionFactores';
import { IMPORTANCIA, type Importancia } from '../guios-core';
import { EncabezadoEvaluacion } from './EncabezadoEvaluacion';
import { EstadoCarga } from './EstadoCarga';
import { EstadoGuardado } from './EstadoGuardado';
import { MarcoDecisor } from './MarcoDecisor';

const NIVELES: readonly Importancia[] = [1, 2, 3, 4];

/** P-04: factores, pasos 1 y 2 (HU-03). Asignar la ID, ver la IS vigente, IR y relevancia en vivo. */
export function FactoresPage() {
  const carga = useEvaluacionCargada(useIdEvaluacion());
  if (carga.estado !== 'lista') {
    return (
      <MarcoDecisor>
        <EstadoCarga carga={carga} />
      </MarcoDecisor>
    );
  }
  return (
    <PanelFactores
      key={carga.evaluacion.id}
      evaluacion={carga.evaluacion}
      calculo={carga.calculo}
      catalogo={carga.catalogo}
    />
  );
}

interface PanelFactoresProps {
  evaluacion: EvaluacionDetalle;
  calculo: CalculoImportancia;
  catalogo: Catalogo;
}

function PanelFactores({ evaluacion, calculo, catalogo }: PanelFactoresProps) {
  const navegar = useNavigate();
  const { filas, resumen, cambiarImportancia, cambiarAlcance, estado, error, esperarGuardado } =
    useValoracionFactores(evaluacion.id, catalogo, calculo, evaluacion.valoraciones);
  const finalizada = evaluacion.estado === 'finalizada';
  const tieneSoftware = evaluacion.contexto.software.nombre.trim() !== '';
  const situacion = situacionDePasos(filas, tieneSoftware, finalizada);
  const todosValorados = resumen.valorados === resumen.total;

  async function continuar() {
    if (await esperarGuardado()) void navegar(rutaDeEvaluacion(evaluacion.id, 'subfactores'));
  }

  const barra = (
    <BottomBar
      onAtras={() => void navegar(rutaDeEvaluacion(evaluacion.id, 'contexto'))}
      {...(finalizada
        ? {}
        : { etiquetaSecundaria: 'Guardar borrador', onSecundaria: () => void esperarGuardado() })}
      etiquetaPrincipal="Continuar a subfactores"
      onPrincipal={() => void continuar()}
      principalDeshabilitado={!todosValorados}
    >
      <EstadoGuardado estado={estado} />
    </BottomBar>
  );

  const dimensiones = catalogo.dimensiones.map((dimension) => ({
    nombre: dimension.nombre,
    filas: filas.filter((fila) => fila.dimension === dimension.nombre),
  }));

  return (
    <MarcoDecisor barraInferior={barra}>
      <EncabezadoEvaluacion
        idEvaluacion={evaluacion.id}
        titulo={evaluacion.contexto.titulo}
        descripcion="Indica qué tan importante es cada factor para tu organización. El sistema combina tu valoración con la sugerida."
        nombreCalculo={calculo.nombre}
        pasos={pasosDeEvaluacion(situacion)}
        actual="factores"
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

      <section className="tarjeta tarjeta--relleno resumen" aria-label="Resumen de la valoración">
        <div className="resumen__fila">
          <div>
            <b className="resumen__cifra">
              {resumen.valorados}/{resumen.total}
            </b>{' '}
            <span className="ayuda-texto">valorados</span>
          </div>
          <div>
            <b className="resumen__cifra resumen__relevantes">{resumen.relevantes}</b>{' '}
            <span className="ayuda-texto">relevantes</span>
          </div>
          <div className="resumen__barra">
            <div
              className="avance"
              role="progressbar"
              aria-label="Factores valorados"
              aria-valuemin={0}
              aria-valuemax={resumen.total}
              aria-valuenow={resumen.valorados}
            >
              <div
                className="avance__relleno"
                style={{
                  width: `${resumen.total ? (resumen.valorados / resumen.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
          <ul className="leyenda" aria-label="Escala de importancia">
            {NIVELES.map((nivel) => (
              <li key={nivel}>
                <i data-nivel={nivel} aria-hidden="true" />
                {IMPORTANCIA[nivel]}
              </li>
            ))}
          </ul>
        </div>
        <details className="resumen__ayuda">
          <summary>¿Cómo se calcula?</summary>
          <p>
            La <b>importancia relativa (IR)</b> es la intersección entre la importancia sugerida
            (IS) y la que tú asignas (ID): el entero inferior del promedio de ambas (Figura 5.10 de
            la tesis). Si la IR es mayor que Irrelevante, el factor es <b>relevante</b> y se valoran
            sus subfactores; si no, se excluye.
          </p>
        </details>
      </section>

      {dimensiones.map(({ nombre, filas: delGrupo }) => (
        <section className="tarjeta grupo-factores" key={nombre} aria-labelledby={`dim-${nombre}`}>
          <div className="tarjeta__cabecera">
            <h2 id={`dim-${nombre}`}>Dimensión {nombre}</h2>
            <span className="ayuda-texto">{delGrupo.length} factores</span>
          </div>
          {delGrupo.map((fila) => (
            <FactorFila
              key={fila.idFactor}
              nombre={fila.nombre}
              totalSubfactores={fila.totalSubfactores}
              alcance={fila.alcance}
              alcanceEditable={fila.alcanceCatalogo === 'Ambos'}
              importanciaSugerida={fila.is}
              ayudaSugerida={textoAyudaImportanciaSugerida(fila, calculo.nombre)}
              importanciaDecisor={fila.id}
              importanciaRelativa={fila.ir}
              relevante={fila.relevante}
              deshabilitado={finalizada}
              onCambiarImportancia={(valor) => cambiarImportancia(fila.idFactor, valor)}
              onCambiarAlcance={(valor) => cambiarAlcance(fila.idFactor, valor)}
            />
          ))}
        </section>
      ))}
    </MarcoDecisor>
  );
}
