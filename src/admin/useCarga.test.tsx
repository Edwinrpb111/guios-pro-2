import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCarga } from './useCarga';

/** Carga controlada: cada llamada queda abierta hasta que la prueba la resuelve. */
function cargaControlada() {
  const pendientes: ((valor: number) => void)[] = [];
  const cargar = () => new Promise<number>((resolver) => pendientes.push(resolver));
  return { cargar, pendientes };
}

describe('useCarga', () => {
  it('sondear no lanza otra lectura mientras una sigue en vuelo (consola en vivo, #45)', async () => {
    const { cargar, pendientes } = cargaControlada();
    const { result } = renderHook(() => useCarga(cargar));
    expect(pendientes).toHaveLength(1);

    act(() => result.current.sondear());
    act(() => result.current.sondear());
    expect(pendientes).toHaveLength(1);

    await act(async () => pendientes[0]?.(7));
    await waitFor(() => expect(result.current.datos).toBe(7));

    act(() => result.current.sondear());
    expect(pendientes).toHaveLength(2);
    await act(async () => pendientes[1]?.(8));
    await waitFor(() => expect(result.current.datos).toBe(8));
  });

  it('recargar sigue lanzando una lectura nueva aunque haya otra en vuelo', () => {
    const { cargar, pendientes } = cargaControlada();
    const { result } = renderHook(() => useCarga(cargar));
    act(() => result.current.recargar());
    expect(pendientes).toHaveLength(2);
  });
});
