/**
 * Consultas y acciones compartidas por las pantallas P-02..P-04 (TanStack Query sobre el
 * repositorio de `src/datos`). Las pantallas no hablan con Supabase: usan estos hooks.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
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

/** Id de la evaluación en la ruta (`/evaluaciones/:id/...`); `null` si no es un entero positivo. */
export function useIdEvaluacion(): number | null {
  const { id } = useParams();
  const numero = Number(id);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/**
 * Carga lo que necesitan los pasos de una evaluación: la evaluación con su contexto y
 * valoraciones, el catálogo y el cálculo de importancia sugerida **de la evaluación**
 * (no el vigente: así su IS queda como fotografía, BRIEF §10.3).
 * La evaluación no se conserva en caché al salir (`gcTime: 0`): cada pantalla lee lo guardado.
 */
export function useEvaluacionCargada(id: number | null) {
  const evaluacion = useQuery({
    queryKey: CLAVES.evaluacion(id ?? 0),
    queryFn: () => repositorio.leerEvaluacion(id ?? 0),
    enabled: id !== null,
    gcTime: 0,
    // El formulario toma la evaluación al abrirse; releerla en segundo plano no le sirve.
    refetchOnWindowFocus: false,
  });
  const idCalculo = evaluacion.data?.idCalculo;
  const calculo = useQuery({
    queryKey: CLAVES.calculo(idCalculo ?? 0),
    queryFn: () => repositorio.leerCalculo(idCalculo ?? 0),
    enabled: idCalculo !== undefined,
    staleTime: Infinity,
  });
  const catalogo = useCatalogo();

  const consultas = [evaluacion, calculo, catalogo];
  const reintentar = () => {
    for (const consulta of consultas) if (consulta.isError) void consulta.refetch();
  };

  if (id === null) return { estado: 'no_encontrada' } as const;
  if (consultas.some((c) => c.isError)) return { estado: 'error', reintentar } as const;
  if (evaluacion.data === null) return { estado: 'no_encontrada' } as const;
  if (!evaluacion.data || !calculo.data || !catalogo.data) return { estado: 'cargando' } as const;
  return {
    estado: 'lista',
    evaluacion: evaluacion.data,
    calculo: calculo.data,
    catalogo: catalogo.data,
  } as const;
}
