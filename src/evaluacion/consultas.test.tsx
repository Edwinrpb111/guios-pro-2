import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { repositorio } from '../datos';
import type { EvaluacionDetalle } from '../datos/tipos';
import {
  calculoPrueba,
  catalogoPrueba,
  evaluacionVaciaPrueba,
  restablecerRepositorioFalso,
} from '../test/datos';
import { CLAVES, useEvaluacionCargada } from './consultas';

vi.mock('../datos', async () => ({
  repositorio: (await import('../test/datos')).crearRepositorioFalso(),
}));

const guardada: EvaluacionDetalle = {
  ...evaluacionVaciaPrueba,
  valoraciones: [{ idFactor: 10, id: 4, alcance: 'Externo', cumplimientos: {} }],
};

beforeEach(() => restablecerRepositorioFalso(repositorio));

describe('useEvaluacionCargada', () => {
  it('no entrega la evaluación que otra pantalla dejó en caché: espera la lectura nueva', async () => {
    const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Catálogo y cálculo ya en memoria; la evaluación, como la leyó P-04 antes de valorar.
    consultas.setQueryData(CLAVES.catalogo, catalogoPrueba);
    consultas.setQueryData(CLAVES.calculo(calculoPrueba.id), calculoPrueba);
    consultas.setQueryData(CLAVES.evaluacion(evaluacionVaciaPrueba.id), evaluacionVaciaPrueba);
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(guardada);
    const envoltura = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={consultas}>{children}</QueryClientProvider>
    );

    const estados: unknown[] = [];
    const { result } = renderHook(
      () => {
        const carga = useEvaluacionCargada(evaluacionVaciaPrueba.id);
        if (carga.estado === 'lista') estados.push(carga.evaluacion.valoraciones);
        return carga;
      },
      { wrapper: envoltura },
    );

    await waitFor(() => expect(result.current.estado).toBe('lista'));
    expect(estados).not.toContainEqual([]);
    expect(result.current.estado === 'lista' && result.current.evaluacion).toEqual(guardada);
  });
});
