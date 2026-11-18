import type { PasoStepper } from '../components/Stepper';
import type { PasoEvaluacion } from './historial';
import type { FilaFactor } from './derivar';

export interface SituacionDePasos {
  /** Hay software registrado (paso «Contexto»). */
  tieneSoftware: boolean;
  /** Todos los factores tienen importancia del decisor (pasos 1 y 2). */
  todosAsignados: boolean;
  /** Hay factores relevantes y todos tienen todos sus subfactores valorados (pasos 3 y 4). */
  subfactoresCompletos: boolean;
  finalizada: boolean;
}

/** Deduce qué pasos están completos a partir de los factores ya derivados con `guios-core`. */
export function situacionDePasos(
  filas: readonly FilaFactor[],
  tieneSoftware: boolean,
  finalizada: boolean,
): SituacionDePasos {
  const relevantes = filas.filter((f) => f.relevante);
  return {
    tieneSoftware,
    todosAsignados: filas.length > 0 && filas.every((f) => f.id !== null),
    subfactoresCompletos: relevantes.length > 0 && relevantes.every((f) => f.estado === 'evaluado'),
    finalizada,
  };
}

/** Los cuatro pasos del stepper (BRIEF §8.4): se avanza solo cuando el anterior está completo. */
export function pasosDeEvaluacion(
  situacion: SituacionDePasos,
): (PasoStepper & { id: PasoEvaluacion })[] {
  return [
    {
      id: 'contexto',
      titulo: 'Contexto',
      subtitulo: 'Software y organización',
      completado: situacion.tieneSoftware,
      habilitado: true,
    },
    {
      id: 'factores',
      titulo: 'Factores',
      subtitulo: 'Pasos 1 y 2',
      completado: situacion.todosAsignados,
      habilitado: situacion.tieneSoftware,
    },
    {
      id: 'subfactores',
      titulo: 'Subfactores',
      subtitulo: 'Pasos 3 y 4',
      completado: situacion.subfactoresCompletos,
      habilitado: situacion.todosAsignados,
    },
    {
      id: 'resultados',
      titulo: 'Resultados',
      subtitulo: 'Pasos 5 y 6',
      completado: situacion.finalizada,
      // Con factores pendientes se pueden ver: se excluyen y los demás deciden (RN-08).
      habilitado: situacion.finalizada || situacion.todosAsignados,
    },
  ];
}
