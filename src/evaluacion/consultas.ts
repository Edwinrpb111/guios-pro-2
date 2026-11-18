/**
 * Consultas y acciones compartidas por las pantallas P-02..P-04 (TanStack Query sobre el
 * repositorio de `src/datos`). Las pantallas no hablan con Supabase: usan estos hooks.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { repositorio } from '../datos';
import { rutaDeEvaluacion } from './historial';

export const CLAVES = {
  catalogo: ['catalogo'] as const,
  calculoVigente: ['calculo-vigente'] as const,
  historial: ['evaluaciones'] as const,
  evaluacion: (id: number) => ['evaluacion', id] as const,
  calculo: (id: number) => ['calculo', id] as const,
};

/** El catálogo casi no cambia (solo con migraciones): se conserva en memoria durante la sesión. */
export const useCatalogo = () =>
  useQuery({
    queryKey: CLAVES.catalogo,
    queryFn: () => repositorio.leerCatalogo(),
    staleTime: Infinity,
  });

export const useCalculoVigente = () =>
  useQuery({
    queryKey: CLAVES.calculoVigente,
    queryFn: () => repositorio.leerCalculoVigente(),
  });

export const useHistorial = () =>
  useQuery({ queryKey: CLAVES.historial, queryFn: () => repositorio.listarEvaluaciones() });

/** Crea un borrador con la IS vigente y abre su contexto (P-03). */
export function useNuevaEvaluacion() {
  const navegar = useNavigate();
  const consultas = useQueryClient();
  const mutacion = useMutation({
    mutationFn: () => repositorio.crearBorrador(),
    onSuccess: async (id) => {
      await consultas.invalidateQueries({ queryKey: CLAVES.historial });
      void navegar(rutaDeEvaluacion(id, 'contexto'));
    },
  });
  return {
    crear: () => mutacion.mutate(),
    creando: mutacion.isPending,
    error: mutacion.error ? mutacion.error.message : null,
  };
}
