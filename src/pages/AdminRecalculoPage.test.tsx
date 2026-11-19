import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CALCULO_IA,
  CALCULO_TESIS,
  crearApiFalsa,
  renderAdmin,
  type ApiFalsa,
} from '../admin/pruebas';
import { ErrorAdmin, type PasoRegistro, type ResultadoPaso } from '../admin/tipos';
import { AdminRecalculoPage } from './AdminRecalculoPage';

const PASO_HECHO: PasoRegistro = {
  idSubfactor: 105,
  nombre: 'Costo de licencias',
  estado: 'hecho',
  iniciadoEn: '2026-11-22T10:00:00Z',
  duracionMs: 4321,
  candidatos: 25,
  aceptados: 9,
  detalle: null,
  registro: {
    intento: 1,
    proveedor: 'gemini',
    busqueda: [{ fuente: 'openalex', ms: 1234, candidatos: 25, error: null }],
    lotes: [{ n: 1, tamano: 10, ms: 2345, reintentos: 0, resultado: 'ok', aceptados: 9 }],
    aceptados: 9,
    resultado: 'hecho',
    mensaje: null,
  },
};

const PASO_CORRIENDO: PasoRegistro = {
  idSubfactor: 106,
  nombre: 'Comunidad activa',
  estado: 'pendiente',
  iniciadoEn: '2026-11-22T10:01:00Z',
  duracionMs: null,
  candidatos: 0,
  aceptados: 0,
  detalle: null,
  registro: null,
};

function montar(api: ApiFalsa) {
  return renderAdmin(<AdminRecalculoPage />, {
    api,
    ruta: '/admin/sugerida/2',
    patron: '/admin/sugerida/:id',
  });
}

const sinTerminar = () => vi.fn(() => new Promise<never>(() => undefined));

describe('P-09: Registro del recálculo (issue #43)', () => {
  it('lista los pasos del cálculo y marca «en curso…» el que se está ejecutando', async () => {
    const api = crearApiFalsa({ pasoRecalculo: sinTerminar() });
    api.registroPasos.mockResolvedValue([PASO_CORRIENDO, PASO_HECHO]);
    montar(api);

    const panel = (await screen.findByText('Registro del recálculo')).closest('section');
    expect(panel).not.toBeNull();
    const dentro = within(panel as HTMLElement);
    expect(await dentro.findByText('Comunidad activa')).toBeInTheDocument();
    expect(dentro.getByText('en curso…')).toBeInTheDocument();
    expect(dentro.getByText('Costo de licencias')).toBeInTheDocument();
    expect(dentro.getByText(/OpenAlex: 25 candidatos/)).toBeInTheDocument();
    expect(api.registroPasos).toHaveBeenCalledWith(2);
    // Con el recálculo corriendo el panel arranca abierto.
    expect(panel?.querySelector('details')).toHaveProperty('open', true);
  });

  it('vuelve a leer recalculo_paso después de cada paso', async () => {
    const pasos: ResultadoPaso[] = [
      { progreso: 1, pendientes: 2, estado: 'en_proceso' },
      { progreso: 9, pendientes: 1, estado: 'en_proceso' },
      { progreso: 18, pendientes: 0, estado: 'en_proceso' },
    ];
    const paso = vi.fn();
    // Cada paso tarda un poco, como en la realidad: así cada uno provoca su propia lectura.
    for (const p of pasos) {
      paso.mockImplementationOnce(() => new Promise((ok) => setTimeout(() => ok(p), 10)));
    }
    const api = crearApiFalsa({ pasoRecalculo: paso });
    api.obtenerCalculo
      .mockResolvedValueOnce(CALCULO_IA)
      .mockResolvedValue({ ...CALCULO_IA, estado: 'completado', progreso: 18 });
    montar(api);

    await waitFor(() => expect(api.guardarResultado).toHaveBeenCalled());
    // Una lectura al abrir y al menos una por cada paso terminado.
    await waitFor(() => expect(api.registroPasos.mock.calls.length).toBeGreaterThanOrEqual(4));
  });

  it('un paso iniciado que no terminó, con el recálculo pausado, está «cortado»', async () => {
    const api = crearApiFalsa();
    api.obtenerCalculo.mockResolvedValue({
      ...CALCULO_IA,
      estado: 'pausado',
      mensajeError: 'El paso se cortó.',
    });
    api.registroPasos.mockResolvedValue([PASO_CORRIENDO]);
    montar(api);
    expect(await screen.findByText('cortado')).toBeInTheDocument();
    expect(screen.queryByText('en curso…')).toBeNull();
  });

  it('un registro mal formado no rompe la pantalla', async () => {
    const api = crearApiFalsa();
    api.obtenerCalculo.mockResolvedValue({ ...CALCULO_IA, estado: 'pausado' });
    api.registroPasos.mockResolvedValue([{ ...PASO_HECHO, registro: null }]);
    montar(api);
    expect(await screen.findByText(/no tiene registro detallado/i)).toBeInTheDocument();
    expect(screen.getByText('Costo de licencias')).toBeInTheDocument();
  });

  it('si no se puede leer el registro lo dice y «Actualizar» lo vuelve a pedir', async () => {
    const usuario = userEvent.setup();
    const api = crearApiFalsa();
    api.obtenerCalculo.mockResolvedValue({ ...CALCULO_IA, estado: 'pausado' });
    api.registroPasos
      .mockRejectedValueOnce(new ErrorAdmin('No se pudo leer el registro.'))
      .mockResolvedValue([PASO_HECHO]);
    montar(api);

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo leer el registro.');
    await usuario.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText('Costo de licencias')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.registroPasos).toHaveBeenCalledTimes(2);
  });

  it('el cálculo inicial de la tesis no tiene pasos: no muestra el panel', async () => {
    const api = crearApiFalsa();
    api.obtenerCalculo.mockResolvedValue({ ...CALCULO_TESIS, id: 2 });
    montar(api);
    await screen.findByRole('heading', { name: 'Cálculo inicial de la tesis' });
    expect(screen.queryByText('Registro del recálculo')).toBeNull();
  });

  it('un cálculo inexistente no muestra el panel', async () => {
    const api = crearApiFalsa();
    api.obtenerCalculo.mockResolvedValue(null);
    montar(api);
    await screen.findByText('No existe el cálculo 2.');
    expect(screen.queryByText('Registro del recálculo')).toBeNull();
  });
});
