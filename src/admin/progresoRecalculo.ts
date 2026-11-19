/**
 * Avance del recálculo por subfactores (issue #45, S16f): cuántos van, cuál se está procesando
 * y cuánto falta según lo que tardaron los últimos pasos. Es aritmética pura sobre el registro
 * de los pasos que la pantalla ya lee cada 2 s.
 */
import type { PasoRegistro } from './tipos';

/** Pasos recientes que entran en el promedio: el ritmo cambia (ritmo de la IA, tamaño de lotes). */
const MUESTRA_PASOS = 5;

export interface ProgresoSubfactores {
  /** Subfactores con su paso terminado. */
  hechos: number;
  /** Subfactores del cálculo; `null` si no se puede saber todavía. */
  total: number | null;
  /** Enunciado del subfactor que se está procesando; `null` si no corre ninguno. */
  actual: string | null;
  /** Estimación del tiempo que falta; `null` mientras no hay un paso terminado con su duración. */
  restanteMs: number | null;
}

export interface EntradaProgreso {
  /** Pasos con actividad, del más reciente al más antiguo (como los devuelve el registro). */
  pasos: readonly PasoRegistro[];
  /** Subfactores del catálogo, `null` si aún no se cargó. */
  totalSubfactores: number | null;
  /** Pasos que faltan según la última respuesta del servidor; `null` si aún no hay respuesta. */
  pendientes: number | null;
  /** El recálculo está ejecutando pasos. */
  corriendo: boolean;
}

export function calcularProgreso({
  pasos,
  totalSubfactores,
  pendientes,
  corriendo,
}: EntradaProgreso): ProgresoSubfactores {
  const hechosRegistro = pasos.filter((p) => p.estado === 'hecho').length;

  let total: number | null =
    totalSubfactores !== null && totalSubfactores > 0 ? totalSubfactores : null;
  if (total === null && pendientes !== null) total = hechosRegistro + pendientes;

  // El registro se lee cada 2 s y `pendientes` llega al terminar cada paso: vale el más avanzado.
  let hechos = hechosRegistro;
  if (total !== null && pendientes !== null) hechos = Math.max(hechos, total - pendientes);
  if (total !== null) hechos = Math.min(hechos, total);

  const enCurso = pasos[0];
  const hayPasoEnCurso =
    corriendo &&
    enCurso !== undefined &&
    enCurso.estado === 'pendiente' &&
    enCurso.iniciadoEn !== null &&
    enCurso.duracionMs === null;
  const actual = hayPasoEnCurso ? (enCurso.nombre ?? `Subfactor ${enCurso.idSubfactor}`) : null;

  const duraciones = pasos
    .filter((p) => p.estado === 'hecho' && p.duracionMs !== null)
    .slice(0, MUESTRA_PASOS)
    .map((p) => p.duracionMs ?? 0);
  let restanteMs: number | null = null;
  if (corriendo && total !== null && duraciones.length > 0) {
    const promedio = duraciones.reduce((suma, ms) => suma + ms, 0) / duraciones.length;
    restanteMs = Math.round(promedio * Math.max(total - hechos, 0));
  }

  return { hechos, total, actual, restanteMs };
}
