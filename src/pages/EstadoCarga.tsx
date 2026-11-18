import { Link } from 'react-router';
import type { useEvaluacionCargada } from '../evaluacion/consultas';

type Carga = ReturnType<typeof useEvaluacionCargada>;

/** Lo que se muestra mientras la evaluación no está lista: carga, error o no encontrada. */
export function EstadoCarga({ carga }: { carga: Exclude<Carga, { estado: 'lista' }> }) {
  if (carga.estado === 'cargando') {
    return (
      <p role="status" className="historial__vacio">
        Cargando la evaluación…
      </p>
    );
  }
  if (carga.estado === 'error') {
    return (
      <div role="alert" className="alerta alerta--error">
        No se pudo cargar la evaluación.{' '}
        <button type="button" className="boton boton--chico" onClick={carga.reintentar}>
          Reintentar
        </button>
      </div>
    );
  }
  return (
    <div className="alerta alerta--info">
      <span>No se encontró la evaluación.</span>
      <Link to="/">Volver al historial</Link>
    </div>
  );
}
