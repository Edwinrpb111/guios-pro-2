/**
 * Presentación del historial de evaluaciones (P-02): avance, ruta para continuar,
 * fecha y filtros. No contiene reglas del método (esas viven en `guios-core`).
 */
import type { Catalogo, EstadoEvaluacion, ResumenEvaluacion } from '../datos/tipos';

/** Pasos de una evaluación y su ruta (BRIEF §12.1). */
export type PasoEvaluacion = 'contexto' | 'factores' | 'subfactores' | 'resultados';

export const rutaDeEvaluacion = (id: number, paso: PasoEvaluacion): string =>
  `/evaluaciones/${id}/${paso}`;

// Pesos del prototipo del CP1 (`progressOf`): asignar importancias pesa 40 %; valorar los subfactores de los relevantes, 60 %.
const PESO_FACTORES = 0.4;
const PESO_SUBFACTORES = 0.6;

/** Porcentaje de avance (0..100) de una evaluación, como el del prototipo del CP1. */
export function porcentajeAvance(evaluacion: ResumenEvaluacion, catalogo: Catalogo): number {
  const factores = catalogo.dimensiones.flatMap((d) => d.factores);
  const totalSubfactores = new Map(factores.map((f) => [f.id, f.idsSubfactores.length]));
  let asignados = 0;
  let subfactoresTotales = 0;
  let subfactoresValorados = 0;
  for (const valorado of evaluacion.factoresValorados) {
    const total = totalSubfactores.get(valorado.idFactor);
    if (total === undefined) continue;
    asignados += 1;
    if (valorado.relevante) {
      subfactoresTotales += total;
      subfactoresValorados += Math.min(valorado.subfactoresValorados, total);
    }
  }
  const avanceFactores = factores.length > 0 ? asignados / factores.length : 0;
  const avanceSubfactores = subfactoresTotales > 0 ? subfactoresValorados / subfactoresTotales : 0;
  return Math.round((avanceFactores * PESO_FACTORES + avanceSubfactores * PESO_SUBFACTORES) * 100);
}

/** Paso al que lleva «Continuar» / «Ver resultados» en el historial. */
export function rutaDeContinuacion(evaluacion: ResumenEvaluacion, totalFactores: number): string {
  if (evaluacion.estado === 'finalizada') return rutaDeEvaluacion(evaluacion.id, 'resultados');
  if (!evaluacion.software) return rutaDeEvaluacion(evaluacion.id, 'contexto');
  if (evaluacion.factoresValorados.length < totalFactores) {
    return rutaDeEvaluacion(evaluacion.id, 'factores');
  }
  return rutaDeEvaluacion(evaluacion.id, 'subfactores');
}

const formatoFecha = new Intl.DateTimeFormat('es-EC', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** `dd/mm/aaaa`, como el historial del prototipo. */
export const formatearFecha = (iso: string): string => formatoFecha.format(new Date(iso));

export interface FiltroHistorial {
  estado: EstadoEvaluacion | 'todas';
  texto: string;
}

const normalizar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Filtra por estado y por texto (título, software u organización), sin distinguir tildes. */
export function filtrarHistorial(
  evaluaciones: readonly ResumenEvaluacion[],
  filtro: FiltroHistorial,
): ResumenEvaluacion[] {
  const buscado = normalizar(filtro.texto.trim());
  return evaluaciones.filter((e) => {
    if (filtro.estado !== 'todas' && e.estado !== filtro.estado) return false;
    if (!buscado) return true;
    const campos = [e.titulo, e.software?.nombre ?? '', e.organizacion ?? ''];
    return campos.some((campo) => normalizar(campo).includes(buscado));
  });
}
