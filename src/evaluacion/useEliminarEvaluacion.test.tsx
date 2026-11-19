import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { repositorio } from '../datos';
import type { ResumenEvaluacion } from '../datos/tipos';
import { evaluacionVaciaPrueba, restablecerRepositorioFalso, resumenPrueba } from '../test/datos';
import { CLAVES } from './consultas';
import { useEliminarEvaluacion } from './useEliminarEvaluacion';

vi.mock('../datos', async () => ({
  repositorio: (await import('../test/datos')).crearRepositorioFalso(),
}));

const historial = [resumenPrueba({ id: 1 }), resumenPrueba({ id: 2, titulo: '' })];

function preparar() {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  consultas.setQueryData(CLAVES.historial, historial);
  consultas.setQueryData(CLAVES.evaluacion(2), { ...evaluacionVaciaPrueba, id: 2 });
  const envoltura = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={consultas}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useEliminarEvaluacion(), { wrapper: envoltura });
  return { consultas, result };
}

const ids = (consultas: QueryClient) =>
  consultas.getQueryData<ResumenEvaluacion[]>(CLAVES.historial)?.map((e) => e.id);

describe('useEliminarEvaluacion', () => {
  beforeEach(() => restablecerRepositorioFalso(repositorio));

  it('elimina la evaluación, la quita del historial y olvida su caché', async () => {
    const { consultas, result } = preparar();
    let eliminada = false;
    await act(async () => {
      eliminada = await result.current.eliminar(2);
    });
    expect(eliminada).toBe(true);
    expect(repositorio.eliminarEvaluacion).toHaveBeenCalledWith(2);
    expect(ids(consultas)).toEqual([1]);
    expect(consultas.getQueryData(CLAVES.evaluacion(2))).toBeUndefined();
    expect(consultas.getQueryState(CLAVES.historial)?.isInvalidated).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('si falla lo informa y el historial queda igual', async () => {
    vi.mocked(repositorio.eliminarEvaluacion).mockRejectedValue(
      new Error('No se pudo eliminar la evaluación.'),
    );
    const { consultas, result } = preparar();
    let eliminada = true;
    await act(async () => {
      eliminada = await result.current.eliminar(2);
    });
    expect(eliminada).toBe(false);
    await waitFor(() => expect(result.current.error).toBe('No se pudo eliminar la evaluación.'));
    expect(ids(consultas)).toEqual([1, 2]);

    act(() => result.current.reiniciar());
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
