import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ContextoApiAdmin } from './contexto';
import { CALCULO_IA, CONTEO_TESIS, FILAS_TESIS, crearApiFalsa, type ApiFalsa } from './pruebas';
import { filasDesdeConteo } from './resultado';
import { ErrorAdmin, type ResultadoPaso } from './tipos';
import { useRecalculo } from './useRecalculo';

function montar(api: ApiFalsa, id = 2) {
  const envoltorio = ({ children }: { children: ReactNode }) => (
    <ContextoApiAdmin.Provider value={api}>{children}</ContextoApiAdmin.Provider>
  );
  return renderHook(() => useRecalculo(id), { wrapper: envoltorio });
}

function pasos(...resultados: (ResultadoPaso | Error)[]) {
  const fn = vi.fn();
  for (const r of resultados) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r);
    else fn.mockResolvedValueOnce(r);
  }
  return fn;
}

describe('useRecalculo (P-09)', () => {
  it('un cálculo en proceso se retoma solo: pasos hasta terminar, IL/IS con guios-core y guardado', async () => {
    const api = crearApiFalsa({
      pasoRecalculo: pasos(
        { progreso: 1, pendientes: 2, estado: 'en_proceso' },
        { progreso: 9, pendientes: 1, estado: 'en_proceso' },
        { progreso: 18, pendientes: 0, estado: 'en_proceso' },
      ),
    });
    api.obtenerCalculo
      .mockResolvedValueOnce(CALCULO_IA)
      .mockResolvedValue({ ...CALCULO_IA, estado: 'completado', progreso: 18 });

    const { result } = montar(api);

    await waitFor(() => expect(result.current.fase).toBe('revision'));
    expect(api.pasoRecalculo).toHaveBeenCalledTimes(3);
    expect(api.pasoRecalculo).toHaveBeenCalledWith(2);
    expect(api.conteoCitas).toHaveBeenCalledWith(2);
    expect(api.guardarResultado).toHaveBeenCalledWith(2, filasDesdeConteo(CONTEO_TESIS));
    expect(result.current.progreso).toBe(18);
    expect(result.current.filas).toEqual(FILAS_TESIS);
  });

  it('pausar espera al paso en curso, pausa en la base y reanudar continúa', async () => {
    let terminarPaso: (r: ResultadoPaso) => void = () => undefined;
    const api = crearApiFalsa({
      pasoRecalculo: vi
        .fn()
        .mockImplementationOnce(() => new Promise((ok) => (terminarPaso = ok)))
        .mockResolvedValue({ progreso: 18, pendientes: 0, estado: 'en_proceso' }),
    });
    api.obtenerCalculo
      .mockResolvedValueOnce(CALCULO_IA)
      .mockResolvedValueOnce({
        ...CALCULO_IA,
        estado: 'pausado',
        progreso: 3,
        mensajeError: 'Pausado.',
      })
      .mockResolvedValue({ ...CALCULO_IA, estado: 'completado' });

    const { result } = montar(api);
    await waitFor(() => expect(result.current.fase).toBe('ejecutando'));

    act(() => result.current.pausar());
    expect(result.current.fase).toBe('pausando');
    await act(async () => terminarPaso({ progreso: 3, pendientes: 20, estado: 'en_proceso' }));

    await waitFor(() => expect(result.current.fase).toBe('pausado'));
    expect(api.pausar).toHaveBeenCalledWith(2);
    expect(api.pasoRecalculo).toHaveBeenCalledTimes(1);
    expect(result.current.progreso).toBe(3);
    expect(result.current.mensaje).toBe('Pausado.');

    act(() => result.current.reanudar());
    await waitFor(() => expect(result.current.fase).toBe('revision'));
    expect(api.pasoRecalculo).toHaveBeenCalledTimes(2);
  });

  it('un 429 o una caída de la API deja el cálculo pausado con el mensaje, sin reintentar', async () => {
    const api = crearApiFalsa({
      pasoRecalculo: pasos(
        new ErrorAdmin('OpenAlex respondió 429.', 'proveedor_no_disponible', 'pausado'),
      ),
    });
    const { result } = montar(api);
    await waitFor(() => expect(result.current.fase).toBe('pausado'));
    expect(result.current.mensaje).toBe('OpenAlex respondió 429.');
    expect(api.pasoRecalculo).toHaveBeenCalledTimes(1);
    expect(api.guardarResultado).not.toHaveBeenCalled();
  });

  it('un error inesperado se muestra y se puede reintentar', async () => {
    const api = crearApiFalsa({
      pasoRecalculo: pasos(new ErrorAdmin('Sin conexión'), {
        progreso: 18,
        pendientes: 0,
        estado: 'en_proceso',
      }),
    });
    api.obtenerCalculo
      .mockResolvedValueOnce(CALCULO_IA)
      .mockResolvedValue({ ...CALCULO_IA, estado: 'completado' });
    const { result } = montar(api);
    await waitFor(() => expect(result.current.fase).toBe('error'));
    expect(result.current.mensaje).toBe('Sin conexión');

    act(() => result.current.reanudar());
    await waitFor(() => expect(result.current.fase).toBe('revision'));
  });

  it('si el guardado falla se informa y se puede reintentar sin repetir pasos', async () => {
    const api = crearApiFalsa({
      guardarResultado: vi
        .fn()
        .mockRejectedValueOnce(new ErrorAdmin('Las filas no coinciden'))
        .mockResolvedValue(undefined),
    });
    api.obtenerCalculo
      .mockResolvedValueOnce(CALCULO_IA)
      .mockResolvedValue({ ...CALCULO_IA, estado: 'completado' });
    const { result } = montar(api);
    await waitFor(() => expect(result.current.fase).toBe('error'));
    expect(result.current.mensaje).toBe('Las filas no coinciden');

    act(() => result.current.reanudar());
    await waitFor(() => expect(result.current.fase).toBe('revision'));
    expect(api.guardarResultado).toHaveBeenCalledTimes(2);
  });

  it('un cálculo pausado al volver espera a que el administrador lo reanude', async () => {
    const api = crearApiFalsa();
    api.obtenerCalculo.mockResolvedValue({
      ...CALCULO_IA,
      estado: 'pausado',
      progreso: 5,
      mensajeError: 'Límite de Crossref',
    });
    const { result } = montar(api);
    await waitFor(() => expect(result.current.fase).toBe('pausado'));
    expect(result.current.progreso).toBe(5);
    expect(result.current.mensaje).toBe('Límite de Crossref');
    expect(api.pasoRecalculo).not.toHaveBeenCalled();
  });

  it('un cálculo completado abre la revisión; publicar lo cierra y conserva sus filas', async () => {
    const api = crearApiFalsa();
    api.obtenerCalculo
      .mockResolvedValueOnce({ ...CALCULO_IA, estado: 'completado' })
      .mockResolvedValue({ ...CALCULO_IA, estado: 'publicado', vigente: true });
    const { result } = montar(api);
    await waitFor(() => expect(result.current.fase).toBe('revision'));
    expect(api.pasoRecalculo).not.toHaveBeenCalled();

    await act(() => result.current.publicar());
    expect(api.publicar).toHaveBeenCalledWith(2);
    expect(result.current.fase).toBe('cerrado');
    expect(result.current.calculo?.vigente).toBe(true);
    expect(result.current.filas).toEqual(FILAS_TESIS);
  });

  it('descartar un cálculo pausado lo cierra', async () => {
    const api = crearApiFalsa();
    api.obtenerCalculo
      .mockResolvedValueOnce({ ...CALCULO_IA, estado: 'pausado' })
      .mockResolvedValue({ ...CALCULO_IA, estado: 'descartado' });
    const { result } = montar(api);
    await waitFor(() => expect(result.current.fase).toBe('pausado'));
    await act(() => result.current.descartar());
    expect(api.descartar).toHaveBeenCalledWith(2);
    expect(result.current.fase).toBe('cerrado');
  });

  it('si publicar falla, sigue en revisión y muestra el motivo', async () => {
    const api = crearApiFalsa({
      publicar: vi.fn().mockRejectedValue(new ErrorAdmin('Solo se publica un cálculo completado')),
    });
    api.obtenerCalculo.mockResolvedValue({ ...CALCULO_IA, estado: 'completado' });
    const { result } = montar(api);
    await waitFor(() => expect(result.current.fase).toBe('revision'));
    await act(() => result.current.publicar());
    expect(result.current.fase).toBe('revision');
    expect(result.current.mensaje).toBe('Solo se publica un cálculo completado');
  });

  it('un cálculo inexistente se informa', async () => {
    const api = crearApiFalsa();
    api.obtenerCalculo.mockResolvedValue(null);
    const { result } = montar(api, 99);
    await waitFor(() => expect(result.current.fase).toBe('no_encontrado'));
  });

  it('al desmontar deja de invocar pasos (el cálculo se retoma al volver)', async () => {
    const api = crearApiFalsa({
      pasoRecalculo: vi
        .fn()
        .mockImplementation(
          () =>
            new Promise((ok) =>
              setTimeout(() => ok({ progreso: 1, pendientes: 5, estado: 'en_proceso' }), 0),
            ),
        ),
    });
    const { unmount } = montar(api);
    await waitFor(() => expect(api.pasoRecalculo).toHaveBeenCalled());
    unmount();
    const llamadas = api.pasoRecalculo.mock.calls.length;
    await new Promise((ok) => setTimeout(ok, 20));
    expect(api.pasoRecalculo.mock.calls.length).toBeLessThanOrEqual(llamadas + 1);
  });
});
