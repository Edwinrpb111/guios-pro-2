import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ContextoApiAdmin } from './contexto';
import { CALCULO_IA, CONTEO_TESIS, FILAS_TESIS, crearApiFalsa, type ApiFalsa } from './pruebas';
import { filasDesdeConteo } from './resultado';
import { ErrorAdmin, type ResultadoPaso } from './tipos';
import { useRecalculo, type OpcionesRecalculo } from './useRecalculo';

function montar(api: ApiFalsa, id = 2, opciones?: OpcionesRecalculo) {
  const envoltorio = ({ children }: { children: ReactNode }) => (
    <ContextoApiAdmin.Provider value={api}>{children}</ContextoApiAdmin.Provider>
  );
  return renderHook(() => useRecalculo(id, opciones), { wrapper: envoltorio });
}

const CORTE = new ErrorAdmin('El paso tardó más de lo permitido.', null, null, 'tiempo');
const RED = new ErrorAdmin('Sin conexión', null, null, 'red');
const PASO_FINAL: ResultadoPaso = { progreso: 18, pendientes: 0, estado: 'en_proceso' };

/** Espera inyectada: no usa el reloj real y deja constancia de cada espera. */
function esperaFalsa() {
  return vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
}

function calculoCompletadoAlFinal(api: ApiFalsa) {
  api.obtenerCalculo
    .mockResolvedValueOnce(CALCULO_IA)
    .mockResolvedValue({ ...CALCULO_IA, estado: 'completado', progreso: 18 });
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

describe('useRecalculo: reintento automático ante un corte (issue #43)', () => {
  it('un corte por tiempo se reintenta solo y el paso sale bien al segundo intento', async () => {
    const esperar = esperaFalsa();
    const api = crearApiFalsa({ pasoRecalculo: pasos(CORTE, PASO_FINAL) });
    calculoCompletadoAlFinal(api);
    const { result } = montar(api, 2, { esperar });

    await waitFor(() => expect(result.current.fase).toBe('revision'));
    expect(api.pasoRecalculo).toHaveBeenCalledTimes(2);
    expect(api.pasoRecalculo).toHaveBeenNthCalledWith(1, 2);
    expect(api.pasoRecalculo).toHaveBeenNthCalledWith(2, 2);
    expect(esperar).toHaveBeenCalledTimes(1);
    expect(esperar.mock.calls[0]?.[0]).toBeGreaterThan(0);
    expect(result.current.mensaje).toBeNull();
  });

  it('avisa que reintenta mientras espera, sin pasar a error', async () => {
    let soltar: () => void = () => undefined;
    const esperar = vi.fn(() => new Promise<void>((ok) => (soltar = ok)));
    const api = crearApiFalsa({ pasoRecalculo: pasos(CORTE, PASO_FINAL) });
    calculoCompletadoAlFinal(api);
    const { result } = montar(api, 2, { esperar });

    await waitFor(() => expect(esperar).toHaveBeenCalled());
    expect(result.current.fase).toBe('ejecutando');
    expect(result.current.mensaje).toMatch(/Reintentando \(1 de 2\)/);

    await act(async () => soltar());
    await waitFor(() => expect(result.current.fase).toBe('revision'));
  });

  it('se rinde tras 2 reintentos y muestra el error con la causa real', async () => {
    const esperar = esperaFalsa();
    const api = crearApiFalsa({ pasoRecalculo: pasos(CORTE, CORTE, CORTE, PASO_FINAL) });
    const { result } = montar(api, 2, { esperar });

    await waitFor(() => expect(result.current.fase).toBe('error'));
    expect(api.pasoRecalculo).toHaveBeenCalledTimes(3);
    expect(esperar).toHaveBeenCalledTimes(2);
    expect(result.current.mensaje).toMatch(/tardó más de lo permitido/);
    expect(result.current.mensaje).not.toMatch(/conexión/);
    expect(api.guardarResultado).not.toHaveBeenCalled();
  });

  it('un fallo de red se reintenta una sola vez', async () => {
    const esperar = esperaFalsa();
    const api = crearApiFalsa({ pasoRecalculo: pasos(RED, RED, PASO_FINAL) });
    const { result } = montar(api, 2, { esperar });

    await waitFor(() => expect(result.current.fase).toBe('error'));
    expect(api.pasoRecalculo).toHaveBeenCalledTimes(2);
    expect(esperar).toHaveBeenCalledTimes(1);
    expect(result.current.mensaje).toBe('Sin conexión');
  });

  it('un fallo de red que se recupera al reintentar sigue adelante', async () => {
    const api = crearApiFalsa({ pasoRecalculo: pasos(RED, PASO_FINAL) });
    calculoCompletadoAlFinal(api);
    const { result } = montar(api, 2, { esperar: esperaFalsa() });
    await waitFor(() => expect(result.current.fase).toBe('revision'));
    expect(api.pasoRecalculo).toHaveBeenCalledTimes(2);
  });

  it('una pausa informada por el servidor no se reintenta', async () => {
    const esperar = esperaFalsa();
    const api = crearApiFalsa({
      pasoRecalculo: pasos(new ErrorAdmin('Sin tiempo.', 'paso_sin_tiempo', 'pausado')),
    });
    const { result } = montar(api, 2, { esperar });
    await waitFor(() => expect(result.current.fase).toBe('pausado'));
    expect(result.current.mensaje).toBe('Sin tiempo.');
    expect(api.pasoRecalculo).toHaveBeenCalledTimes(1);
    expect(esperar).not.toHaveBeenCalled();
  });

  it('un cálculo cerrado no se reintenta: se vuelve a abrir', async () => {
    const esperar = esperaFalsa();
    const api = crearApiFalsa({
      pasoRecalculo: pasos(new ErrorAdmin('Cerrado.', 'calculo_cerrado', null)),
    });
    api.obtenerCalculo
      .mockResolvedValueOnce(CALCULO_IA)
      .mockResolvedValue({ ...CALCULO_IA, estado: 'descartado' });
    const { result } = montar(api, 2, { esperar });
    await waitFor(() => expect(result.current.fase).toBe('cerrado'));
    expect(api.pasoRecalculo).toHaveBeenCalledTimes(1);
    expect(esperar).not.toHaveBeenCalled();
  });

  it('un error con mensaje del servidor (proveedor_cambiado) no se reintenta', async () => {
    const esperar = esperaFalsa();
    const api = crearApiFalsa({
      pasoRecalculo: pasos(new ErrorAdmin('El proveedor cambió.', 'proveedor_cambiado')),
    });
    const { result } = montar(api, 2, { esperar });
    await waitFor(() => expect(result.current.fase).toBe('error'));
    expect(result.current.mensaje).toBe('El proveedor cambió.');
    expect(api.pasoRecalculo).toHaveBeenCalledTimes(1);
    expect(esperar).not.toHaveBeenCalled();
  });

  it('si se pide pausar durante la espera, no se reintenta y se pausa en la base', async () => {
    let soltar: () => void = () => undefined;
    const esperar = vi.fn(() => new Promise<void>((ok) => (soltar = ok)));
    const api = crearApiFalsa({ pasoRecalculo: pasos(CORTE, PASO_FINAL) });
    api.obtenerCalculo
      .mockResolvedValueOnce(CALCULO_IA)
      .mockResolvedValue({ ...CALCULO_IA, estado: 'pausado', mensajeError: 'Pausado.' });
    const { result } = montar(api, 2, { esperar });

    await waitFor(() => expect(esperar).toHaveBeenCalled());
    act(() => result.current.pausar());
    await act(async () => soltar());

    await waitFor(() => expect(result.current.fase).toBe('pausado'));
    expect(api.pausar).toHaveBeenCalledWith(2);
    expect(api.pasoRecalculo).toHaveBeenCalledTimes(1);
  });

  it('al desmontar durante la espera no vuelve a invocar el paso', async () => {
    let soltar: () => void = () => undefined;
    const esperar = vi.fn(() => new Promise<void>((ok) => (soltar = ok)));
    const api = crearApiFalsa({ pasoRecalculo: pasos(CORTE, PASO_FINAL) });
    const { unmount } = montar(api, 2, { esperar });
    await waitFor(() => expect(esperar).toHaveBeenCalled());
    unmount();
    await act(async () => soltar());
    expect(api.pasoRecalculo).toHaveBeenCalledTimes(1);
  });
});

describe('useRecalculo: refresco del registro (issue #43)', () => {
  it('avisa tras cada paso terminado para volver a leer recalculo_paso', async () => {
    const api = crearApiFalsa({
      pasoRecalculo: pasos(
        { progreso: 1, pendientes: 2, estado: 'en_proceso' },
        { progreso: 9, pendientes: 1, estado: 'en_proceso' },
        PASO_FINAL,
      ),
    });
    calculoCompletadoAlFinal(api);
    const { result } = montar(api);
    expect(result.current.registroVersion).toBe(0);
    await waitFor(() => expect(result.current.fase).toBe('revision'));
    expect(result.current.registroVersion).toBeGreaterThanOrEqual(3);
  });

  it('también avisa cuando un paso falla, para ver cómo quedó', async () => {
    const api = crearApiFalsa({ pasoRecalculo: pasos(new ErrorAdmin('Falló')) });
    const { result } = montar(api);
    await waitFor(() => expect(result.current.fase).toBe('error'));
    expect(result.current.registroVersion).toBeGreaterThanOrEqual(1);
  });

  it('avisa tras cada intento de un paso cortado, no solo al final', async () => {
    const api = crearApiFalsa({ pasoRecalculo: pasos(CORTE, CORTE, CORTE) });
    const { result } = montar(api, 2, { esperar: esperaFalsa() });
    await waitFor(() => expect(result.current.fase).toBe('error'));
    expect(result.current.registroVersion).toBeGreaterThanOrEqual(3);
  });
});
