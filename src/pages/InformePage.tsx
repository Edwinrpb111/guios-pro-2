import { useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { BottomBar } from '../components/BottomBar';
import { FodaChip } from '../components/FodaChip';
import { FodaMatrix, type FactorFoda } from '../components/FodaMatrix';
import { RecomendacionCard } from '../components/RecomendacionCard';
import { formatearPm } from '../components/formato';
import type { CalculoImportancia, Catalogo, EvaluacionDetalle } from '../datos/tipos';
import { useEvaluacionCargada, useIdEvaluacion } from '../evaluacion/consultas';
import {
  derivarFactores,
  derivarResultados,
  detalleSubfactores,
  recomendacionAMostrar,
  type FilaFactor,
} from '../evaluacion/derivar';
import { formatearFecha, rutaDeEvaluacion } from '../evaluacion/historial';
import { nombreDeUsuario } from '../evaluacion/usuario';
import { CUMPLIMIENTO, IMPORTANCIA, VERSION_METODO } from '../guios-core';
import { EstadoCarga } from './EstadoCarga';
import { MarcoDecisor } from './MarcoDecisor';

/**
 * Informe imprimible (HU-15, BRIEF §8.1): vista de solo lectura que se guarda como PDF con
 * `window.print()` y las reglas `@media print` de `informe.css`. Sin servidor.
 */
export function InformePage() {
  const carga = useEvaluacionCargada(useIdEvaluacion());
  if (carga.estado !== 'lista') {
    return (
      <MarcoDecisor>
        <EstadoCarga carga={carga} />
      </MarcoDecisor>
    );
  }
  return (
    <Informe evaluacion={carga.evaluacion} calculo={carga.calculo} catalogo={carga.catalogo} />
  );
}

interface InformeProps {
  evaluacion: EvaluacionDetalle;
  calculo: CalculoImportancia;
  catalogo: Catalogo;
}

const textoEstadoDeFactor = (fila: FilaFactor): string => {
  switch (fila.estado) {
    case 'evaluado':
      return 'Evaluado';
    case 'pendiente':
      return 'Pendiente: faltan subfactores; no cuenta para la recomendación';
    case 'no_relevante':
      return 'Se excluye: importancia relativa irrelevante';
    case 'sin_valorar':
      return 'Sin valorar';
  }
};

function Informe({ evaluacion, calculo, catalogo }: InformeProps) {
  const navegar = useNavigate();
  const { usuario } = useAuth();
  const finalizada = evaluacion.estado === 'finalizada';
  const { contexto } = evaluacion;

  const filas = derivarFactores(catalogo, calculo, evaluacion.valoraciones);
  const resultados = derivarResultados(filas);
  const recomendacion = recomendacionAMostrar(evaluacion, resultados.recomendacion);
  const factoresPorId = new Map(
    catalogo.dimensiones.flatMap((d) => d.factores).map((f) => [f.id, f]),
  );
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
  const relevantes = filas.flatMap((fila) => {
    const factor = fila.relevante ? factoresPorId.get(fila.idFactor) : undefined;
    return factor
      ? [
          {
            fila,
            detalle: detalleSubfactores(
              factor,
              catalogo.subfactores,
              evaluacion.valoraciones.find((v) => v.idFactor === fila.idFactor),
            ),
          },
        ]
      : [];
  });

  const barra = (
    <BottomBar
      onAtras={() => void navegar(rutaDeEvaluacion(evaluacion.id, 'resultados'))}
      etiquetaPrincipal="Imprimir o guardar como PDF"
      onPrincipal={() => window.print()}
    />
  );

  return (
    <MarcoDecisor barraInferior={barra}>
      {!finalizada && (
        <div className="alerta alerta--info sin-imprimir">
          Borrador: la evaluación no está finalizada, así que el informe puede cambiar.
        </div>
      )}
      <article className="informe" aria-label="Informe de evaluación">
        <header className="informe__cabecera">
          <p className="informe__marca">GUIOS PRO 2.0 · Informe de evaluación</p>
          <h1>{contexto.titulo.trim() === '' ? 'Evaluación sin título' : contexto.titulo}</h1>
          {!finalizada && <p className="informe__borrador">Borrador (sin finalizar)</p>}
          <dl className="informe__datos">
            <div>
              <dt>Software</dt>
              <dd>
                {`${contexto.software.nombre} ${contexto.software.version}`.trim() ||
                  'No registrado'}
                {contexto.software.licencia && ` · ${contexto.software.licencia}`}
              </dd>
            </div>
            <div>
              <dt>Organización</dt>
              <dd>
                {contexto.organizacion.nombre || 'No registrada'}
                {[contexto.organizacion.sector, contexto.organizacion.pais]
                  .filter(Boolean)
                  .map((dato) => ` · ${dato}`)
                  .join('')}
              </dd>
            </div>
            <div>
              <dt>{finalizada ? 'Finalizada el' : 'Última modificación'}</dt>
              <dd>{formatearFecha(evaluacion.fecha)}</dd>
            </div>
            <div>
              <dt>Decisor</dt>
              <dd>{nombreDeUsuario(usuario)}</dd>
            </div>
            <div>
              <dt>Importancia sugerida</dt>
              <dd>{calculo.nombre}</dd>
            </div>
          </dl>
        </header>

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

        <section className="informe__seccion" aria-labelledby="informe-foda">
          <h2 id="informe-foda">Matriz FODA</h2>
          <FodaMatrix factores={factoresMatriz} textoVacio="Sin factores evaluados" />
        </section>

        <section className="informe__seccion" aria-labelledby="informe-factores">
          <h2 id="informe-factores">Resultados por factor</h2>
          <table className="informe__tabla" aria-labelledby="informe-factores">
            <thead>
              <tr>
                <th scope="col">Factor</th>
                <th scope="col">Alcance</th>
                <th scope="col">Sugerida</th>
                <th scope="col">Decisor</th>
                <th scope="col">Relativa</th>
                <th scope="col">PM</th>
                <th scope="col">FODA</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => (
                <tr key={fila.idFactor}>
                  <th scope="row">{fila.nombre}</th>
                  <td>{fila.alcance}</td>
                  <td>{IMPORTANCIA[fila.is]}</td>
                  <td>{fila.id === null ? '—' : IMPORTANCIA[fila.id]}</td>
                  <td>{fila.ir === null ? '—' : IMPORTANCIA[fila.ir]}</td>
                  <td>{formatearPm(fila.pm)}</td>
                  <td>{fila.foda ? <FodaChip foda={fila.foda} /> : '—'}</td>
                  <td>{textoEstadoDeFactor(fila)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="informe__seccion" aria-labelledby="informe-subfactores">
          <h2 id="informe-subfactores">Detalle por subfactor</h2>
          {relevantes.length === 0 && <p>Ningún factor es relevante.</p>}
          {relevantes.map(({ fila, detalle }) => (
            <div key={fila.idFactor} className="informe__factor">
              <h3>
                {fila.nombre}{' '}
                <small>
                  {detalle.valorados}/{detalle.total} subfactores valorados
                </small>
              </h3>
              <ol>
                {detalle.subfactores.map((subfactor) => (
                  <li key={subfactor.id}>
                    <span>{subfactor.enunciado}</span>
                    <b>{subfactor.ps === null ? 'Sin valorar' : CUMPLIMIENTO[subfactor.ps]}</b>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>

        <footer className="informe__pie">
          Método {VERSION_METODO} (Rea Sánchez, 2022). Informe generado por GUIOS PRO 2.0.
        </footer>
      </article>
    </MarcoDecisor>
  );
}
