import { useMutation, useQueryClient } from '@tanstack/react-query';
import { repositorio } from '../datos';
import type { Finalizacion } from '../datos/tipos';
import { CLAVES } from './consultas';

/**
 * Finalizar la evaluación (P-06, BRIEF §11.1): guarda la fotografía de los factores y la
 * recomendación con sus causas, y congela la evaluación. Después relee la evaluación y el
 * historial para que las pantallas la muestren como finalizada.
 */
export function useFinalizarEvaluacion(idEvaluacion: number) {
  const consultas = useQueryClient();
  const mutacion = useMutation({
    mutationFn: (finalizacion: Finalizacion) =>
      repositorio.finalizarEvaluacion(idEvaluacion, finalizacion),
    onSuccess: async () => {
      await Promise.all([
        consultas.invalidateQueries({ queryKey: CLAVES.evaluacion(idEvaluacion) }),
        consultas.invalidateQueries({ queryKey: CLAVES.historial }),
      ]);
    },
  });
  const { mutateAsync } = mutacion;

  /** Resuelve `true` si quedó finalizada; el motivo del fallo queda en `error`. */
  const finalizar = async (finalizacion: Finalizacion): Promise<boolean> => {
    try {
      await mutateAsync(finalizacion);
      return true;
    } catch {
      return false;
    }
  };

  return {
    finalizar,
    finalizando: mutacion.isPending,
    error: mutacion.error ? mutacion.error.message : null,
  };
}
