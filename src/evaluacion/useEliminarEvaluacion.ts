import { useMutation, useQueryClient } from '@tanstack/react-query';
import { repositorio } from '../datos';
import type { ResumenEvaluacion } from '../datos/tipos';
import { CLAVES } from './consultas';

/**
 * Eliminar una evaluación desde el historial (P-02, issue #32). Al confirmarse la quita
 * enseguida del historial (y de sus contadores), olvida su caché y relee el historial.
 * Si falla, el historial no cambia y el motivo queda en `error`.
 */
export function useEliminarEvaluacion() {
  const consultas = useQueryClient();
  const mutacion = useMutation({
    mutationFn: (idEvaluacion: number) => repositorio.eliminarEvaluacion(idEvaluacion),
    onSuccess: async (_vacio, idEvaluacion) => {
      consultas.removeQueries({ queryKey: CLAVES.evaluacion(idEvaluacion) });
      consultas.setQueryData<ResumenEvaluacion[]>(CLAVES.historial, (lista) =>
        lista?.filter((e) => e.id !== idEvaluacion),
      );
      await consultas.invalidateQueries({ queryKey: CLAVES.historial });
    },
  });
  const { mutateAsync, reset } = mutacion;

  /** Resuelve `true` si se eliminó; el motivo del fallo queda en `error`. */
  const eliminar = async (idEvaluacion: number): Promise<boolean> => {
    try {
      await mutateAsync(idEvaluacion);
      return true;
    } catch {
      return false;
    }
  };

  return {
    eliminar,
    eliminando: mutacion.isPending,
    error: mutacion.error ? mutacion.error.message : null,
    /** Olvida el último error (al cerrar o reabrir la confirmación). */
    reiniciar: reset,
  };
}
