import { useState } from 'react';
import { useNavigate } from 'react-router';
import { BottomBar } from '../components/BottomBar';
import { FodaMatrix, type FactorFoda } from '../components/FodaMatrix';
import { PmBar } from '../components/PmBar';
import { RecomendacionCard } from '../components/RecomendacionCard';
import type { CalculoImportancia, Catalogo, EvaluacionDetalle } from '../datos/tipos';
import { useEvaluacionCargada, useIdEvaluacion } from '../evaluacion/consultas';
import {
  derivarFactores,
  derivarResultados,
  detalleSubfactores,
  filasParaFinalizar,
  recomendacionAMostrar,
  recomendacionParaGuardar,
  type FilaFactor,
} from '../evaluacion/derivar';
import { rutaDeEvaluacion } from '../evaluacion/historial';
import { pasosDeEvaluacion, situacionDePasos } from '../evaluacion/pasos';
import { useFinalizarEvaluacion } from '../evaluacion/useFinalizarEvaluacion';
import { IMPORTANCIA } from '../guios-core';
import { EncabezadoEvaluacion } from './EncabezadoEvaluacion';
import { EstadoCarga } from './EstadoCarga';
import { MarcoDecisor } from './MarcoDecisor';

/** P-06: resultados, pasos 5 y 6 (HU-05, HU-06, HU-12). Matriz FODA, recomendación y Finalizar. */
export function ResultadosPage() {
  const carga = useEvaluacionCargada(useIdEvaluacion());
  if (carga.estado !== 'lista') {
    return (
      <MarcoDecisor>
        <EstadoCarga carga={carga} />
      </MarcoDecisor>
    );
  }
  return (
    <PanelResultados
      key={carga.evaluacion.id}
      evaluacion={carga.evaluacion}
      calculo={carga.calculo}
      catalogo={carga.catalogo}
    />
  );
}

interface PanelResultadosProps {
  evaluacion: EvaluacionDetalle;
  calculo: CalculoImportancia;
  catalogo: Catalogo;
}

const plural = (n: number, singular: string, pluralizado: string) =>
  `${n} ${n === 1 ? singular : pluralizado}`;

function PanelResultados({ evaluacion, calculo, catalogo }: PanelResultadosProps) {
  const navegar = useNavigate();
  const [confirmando, setConfirmando] = useState(false);
  const { finalizar, finalizando, error } = useFinalizarEvaluacion(evaluacion.id);
  const finalizada = evaluacion.estado === 'finalizada';

  const filas = derivarFactores(catalogo, calculo, evaluacion.valoraciones);
  const resultados = derivarResultados(filas);
  const recomendacion = recomendacionAMostrar(evaluacion, resultados.recomendacion);
  const aGuardar = recomendacionParaGuardar(resultados);
  const situacion = situacionDePasos(
    filas,
    evaluacion.contexto.software.nombre.trim() !== '',
    finalizada,
  );

  const irASubfactores = (idFactor: number) =>
    void navegar(`${rutaDeEvaluacion(evaluacion.id, 'subfactores')}?factor=${idFactor}`);

  const factoresMatriz: FactorFoda[] = resultados.evaluados.flatMap((fila) =>
    fila.foda === null || fila.ir === null
      ? []
      : [
          {
            id: String(fila.idFactor),
            nombre: fila.nombre,
            foda: fila.foda,
            ir: IMPORTANCIA[fila.ir],
            pm: fila.pm,
          },
        ],
  );

  async function confirmarFinalizacion() {
    if (!aGuardar) return;
    const correcto = await finalizar({
      factores: filasParaFinalizar(filas),
      recomendacion: aGuardar,
    });
    if (correcto) setConfirmando(false);
  }

  const barra = (
    <BottomBar
      onAtras={() => void navegar(rutaDeEvaluacion(evaluacion.id, 'subfactores'))}
      {...(finalizada
        ? {}
        : {
            etiquetaSecundaria: 'Ver informe',
            onSecundaria: () => void navegar(rutaDeEvaluacion(evaluacion.id, 'informe')),
          })}
      etiquetaPrincipal={finalizada ? 'Ver informe' : 'Finalizar evaluación'}
      onPrincipal={() =>
        finalizada ? void navegar(rutaDeEvaluacion(evaluacion.id, 'informe')) : setConfirmando(true)
      }
      principalDeshabilitado={!finalizada && aGuardar === null}
    />
  );

  return (
    <MarcoDecisor barraInferior={barra}>
      <EncabezadoEvaluacion
        idEvaluacion={evaluacion.id}
        titulo={evaluacion.contexto.titulo}
        descripcion="Clasificación FODA de cada factor evaluado y recomendación del método. Solo cuentan los factores con todos sus subfactores valorados."
        nombreCalculo={calculo.nombre}
        pasos={pasosDeEvaluacion(situacion)}
        actual="resultados"
      />
      {finalizada && (
        <div className="alerta alerta--info">
          Esta evaluación está finalizada y no se puede editar.
        </div>
      )}
      {error && (
        <div role="alert" className="alerta alerta--error">
          No se pudo finalizar la evaluación: {error}
        </div>
      )}
      {confirmando && !finalizada && (
        <section
          role="alertdialog"
          aria-label="Confirmar finalización"
          className="alerta alerta--confirmar"
        >
          <p>
            Al finalizar, la evaluación se congela y ya no se podrá editar. Se guardan los
            resultados, la recomendación y los factores que la causan.
            {resultados.pendientes.length > 0 &&
              ` ${plural(
                resultados.pendientes.length,
                'factor pendiente quedará excluido',
                'factores pendientes quedarán excluidos',
              )} de la recomendación.`}
          </p>
          <div className="alerta__acciones">
            <button
              type="button"
              className="boton boton--primario"
              disabled={finalizando}
              onClick={() => void confirmarFinalizacion()}
            >
              Confirmar y finalizar
            </button>
            <button
              type="button"
              className="boton"
              disabled={finalizando}
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      <RecomendacionCard
        codigo={recomendacion?.codigo ?? null}
        {...(recomendacion
          ? {
              titulo: recomendacion.titulo,
              texto: recomendacion.texto,
              causas: recomendacion.causas,
            }
          : {})}
      />

      <section className="tarjeta tarjeta--relleno" aria-labelledby="titulo-foda">
        <div className="tarjeta__cabecera">
          <h2 id="titulo-foda">Matriz FODA</h2>
          <span className="ayuda-texto">
            {plural(resultados.evaluados.length, 'factor evaluado', 'factores evaluados')}
          </span>
        </div>
        <FodaMatrix
          factores={factoresMatriz}
          onSeleccionarFactor={(id) => irASubfactores(Number(id))}
          textoVacio="Sin factores evaluados"
        />
      </section>

      {resultados.pendientes.length > 0 && (
        <section
          className="tarjeta tarjeta--relleno resultados__pendientes"
          aria-label="Factores pendientes"
        >
          <h2>Factores pendientes</h2>
          <p className="ayuda-texto">
            Son relevantes pero les faltan subfactores por valorar: no cuentan para la recomendación
            hasta completarlos.
          </p>
          <ul>
            {resultados.pendientes.map((fila) => (
              <ItemPendiente
                key={fila.idFactor}
                fila={fila}
                faltan={faltanSubfactores(fila, catalogo, evaluacion)}
                editable={!finalizada}
                onCompletar={() => irASubfactores(fila.idFactor)}
              />
            ))}
          </ul>
        </section>
      )}

      {resultados.evaluados.length > 0 && (
        <section className="tarjeta tarjeta--relleno" aria-labelledby="titulo-pm">
          <h2 id="titulo-pm">Ponderación media por factor</h2>
          {resultados.evaluados.map((fila) => (
            <PmBar
              key={fila.idFactor}
              variante="compacta"
              nombre={fila.nombre}
              valor={fila.pm}
              foda={fila.foda}
            />
          ))}
        </section>
      )}

      {resultados.excluidos.length > 0 && (
        <p className="ayuda-texto">
          {plural(resultados.excluidos.length, 'factor se excluye', 'factores se excluyen')} por su
          importancia relativa irrelevante:{' '}
          {resultados.excluidos.map((fila) => fila.nombre).join(', ')}.
        </p>
      )}
    </MarcoDecisor>
  );
}

function faltanSubfactores(
  fila: FilaFactor,
  catalogo: Catalogo,
  evaluacion: EvaluacionDetalle,
): number {
  const factor = catalogo.dimensiones
    .flatMap((d) => d.factores)
    .find((f) => f.id === fila.idFactor);
  if (!factor) return 0;
  const detalle = detalleSubfactores(
    factor,
    catalogo.subfactores,
    evaluacion.valoraciones.find((v) => v.idFactor === fila.idFactor),
  );
  return detalle.total - detalle.valorados;
}

interface ItemPendienteProps {
  fila: FilaFactor;
  faltan: number;
  editable: boolean;
  onCompletar: () => void;
}

function ItemPendiente({ fila, faltan, editable, onCompletar }: ItemPendienteProps) {
  return (
    <li>
      <b>{fila.nombre}</b>
      <span className="ayuda-texto">
        {faltan === 1 ? 'falta 1 subfactor' : `faltan ${faltan} subfactores`}; no cuentan para la
        recomendación
      </span>
      {editable && (
        <button
          type="button"
          className="boton boton--chico"
          aria-label={`Completar ${fila.nombre}`}
          onClick={onCompletar}
        >
          Completar
        </button>
      )}
    </li>
  );
}
