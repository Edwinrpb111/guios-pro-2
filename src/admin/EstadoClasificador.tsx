import { useCallback } from 'react';
import { Link } from 'react-router';
import { useApiAdmin } from './contexto';
import type { ConfiguracionRecalculo } from './tipos';
import { useCarga } from './useCarga';

const SECRETOS = 'secretos de Supabase';

function formatearUmbral(umbral: number): string {
  return umbral.toLocaleString('es-EC', { maximumFractionDigits: 3 });
}

/** Texto del clasificador según lo guardado; lo no definido lo toman los secretos de entorno. */
function Resumen({ configuracion }: { configuracion: ConfiguracionRecalculo }) {
  const { parametros, claves } = configuracion;
  const claveGemini = claves.find((c) => c.nombre === 'GEMINI_API_KEY');
  const detalles = [
    parametros.umbral === null
      ? `umbral: ${SECRETOS}`
      : `umbral ${formatearUmbral(parametros.umbral)}`,
    parametros.maxCandidatos === null
      ? `máx. de candidatos: ${SECRETOS}`
      : `máx. ${parametros.maxCandidatos} candidatos por subfactor`,
  ].join(' · ');

  if (parametros.proveedorLlm === 'fake') {
    return (
      <p>
        <b>Clasificador falso</b> (demostración: sin red ni claves, resultados repetibles).
      </p>
    );
  }
  return (
    <>
      <p>
        {parametros.proveedorLlm === 'gemini' ? (
          <b>Gemini · {parametros.modelo ?? `modelo de los ${SECRETOS}`}</b>
        ) : (
          <b>Proveedor definido en los {SECRETOS} (LLM_PROVIDER)</b>
        )}{' '}
        · {detalles}
      </p>
      {parametros.proveedorLlm === 'gemini' &&
        (claveGemini?.configurada ? (
          <p>Clave de Gemini: configurada.</p>
        ) : (
          <p>
            La clave de Gemini no está guardada en la app: se usará GEMINI_API_KEY de los {SECRETOS}
            , si existe.
          </p>
        ))}
    </>
  );
}

/**
 * Recuadro de P-09 con el estado del clasificador que usará el recálculo y un enlace a
 * «Configuración del recálculo» (issue #33). No muestra claves: solo si están guardadas.
 */
export function EstadoClasificador() {
  const api = useApiAdmin();
  const { datos, error, cargando } = useCarga(useCallback(() => api.obtenerConfiguracion(), [api]));

  return (
    <section className="admin-aviso admin-clasificador" aria-label="Estado del clasificador">
      <h2 className="admin-clasificador__titulo">Clasificador del recálculo</h2>
      {cargando && <p>Cargando la configuración…</p>}
      {!cargando && (error !== null || datos === undefined) && (
        <p>No se pudo leer la configuración del recálculo; se usarán los {SECRETOS}.</p>
      )}
      {!cargando && error === null && datos !== undefined && <Resumen configuracion={datos} />}
      <p>
        <Link className="admin-enlace" to="/admin/configuracion">
          Configuración del recálculo
        </Link>
      </p>
    </section>
  );
}
