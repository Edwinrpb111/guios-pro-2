import { useCallback } from 'react';
import { Link } from 'react-router';
import { useApiAdmin } from './contexto';
import { ResumenClasificador } from './ResumenClasificador';
import { useCarga } from './useCarga';

const SECRETOS = 'secretos de Supabase';

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
      {!cargando && error === null && datos !== undefined && (
        <ResumenClasificador configuracion={datos} />
      )}
      <p>
        <Link className="admin-enlace" to="/admin/configuracion">
          Configuración del recálculo
        </Link>
      </p>
    </section>
  );
}
