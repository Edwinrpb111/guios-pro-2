import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CALCULO_IA,
  CALCULO_TESIS,
  FILAS_TESIS,
  crearApiFalsa,
  definido,
  renderAdmin,
} from './pruebas';
import { RutasSugerida } from './rutas';
import { ErrorAdmin } from './tipos';

function montar(ruta: string, api = crearApiFalsa()) {
  return renderAdmin(<RutasSugerida />, { api, ruta, patron: '/admin/sugerida/*' });
}

describe('P-09: nuevo recálculo (/admin/sugerida/nuevo)', () => {
  it('inicia el recálculo con los años y fuentes elegidos y pasa al progreso', async () => {
    const usuario = userEvent.setup();
    const api = crearApiFalsa({
      iniciarRecalculo: vi.fn().mockResolvedValue(7),
      pasoRecalculo: vi.fn(() => new Promise<never>(() => undefined)),
    });
    api.obtenerCalculo.mockResolvedValue({ ...CALCULO_IA, id: 7 });
    montar('/admin/sugerida/nuevo', api);

    expect(screen.getByRole('heading', { name: 'Nuevo recálculo' })).toBeInTheDocument();
    const desde = screen.getByLabelText('Desde (año)');
    await usuario.clear(desde);
    await usuario.type(desde, '2021');
    await usuario.click(screen.getByRole('checkbox', { name: /Crossref/ }));
    await usuario.click(screen.getByRole('button', { name: 'Iniciar recálculo' }));

    expect(api.iniciarRecalculo).toHaveBeenCalledWith({
      anioInicio: 2021,
      anioFin: 2025,
      fuentes: ['openalex'],
    });
    expect(await screen.findByRole('heading', { name: 'Recálculo IA 2020–2025' })).toBeVisible();
  });

  it('valida el formulario sin llamar a la Edge Function', async () => {
    const usuario = userEvent.setup();
    const api = crearApiFalsa();
    montar('/admin/sugerida/nuevo', api);
    const hasta = screen.getByLabelText('Hasta (año)');
    await usuario.clear(hasta);
    await usuario.type(hasta, '2019');
    await usuario.click(screen.getByRole('button', { name: 'Iniciar recálculo' }));
    expect(screen.getByRole('alert')).toHaveTextContent('no puede ser mayor');
    expect(api.iniciarRecalculo).not.toHaveBeenCalled();
  });

  it('muestra el error de la Edge Function (p. ej. un decisor recibe 403)', async () => {
    const usuario = userEvent.setup();
    const api = crearApiFalsa({
      iniciarRecalculo: vi
        .fn()
        .mockRejectedValue(
          new ErrorAdmin('Solo un administrador puede recalcular.', 'solo_administrador'),
        ),
    });
    montar('/admin/sugerida/nuevo', api);
    await usuario.click(screen.getByRole('button', { name: 'Iniciar recálculo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo un administrador');
    expect(screen.getByRole('button', { name: 'Iniciar recálculo' })).toBeEnabled();
  });
});

describe('P-09: progreso y revisión (/admin/sugerida/:id)', () => {
  it('muestra el progreso de 0..18 factores y permite pausar y reanudar', async () => {
    const usuario = userEvent.setup();
    let terminar: () => void = () => undefined;
    const api = crearApiFalsa({
      pasoRecalculo: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((ok) => {
              terminar = () => ok({ progreso: 4, pendientes: 30, estado: 'en_proceso' });
            }),
        )
        .mockImplementation(() => new Promise<never>(() => undefined)),
    });
    api.obtenerCalculo.mockResolvedValueOnce(CALCULO_IA).mockResolvedValue({
      ...CALCULO_IA,
      estado: 'pausado',
      progreso: 4,
      mensajeError: 'Pausado por el administrador.',
    });
    montar('/admin/sugerida/2', api);

    await usuario.click(await screen.findByRole('button', { name: 'Pausar' }));
    expect(screen.getByText(/Pausando al terminar el subfactor en curso/)).toBeInTheDocument();
    terminar();

    expect(await screen.findByRole('button', { name: 'Reanudar' })).toBeInTheDocument();
    const barra = screen.getByRole('progressbar', { name: 'Factores procesados' });
    expect(barra).toHaveAttribute('aria-valuenow', '4');
    expect(barra).toHaveAttribute('aria-valuemax', '18');
    expect(screen.getByText('4 de 18 factores procesados')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Pausado por el administrador.');

    await usuario.click(screen.getByRole('button', { name: 'Reanudar' }));
    expect(await screen.findByRole('button', { name: 'Pausar' })).toBeInTheDocument();
    expect(api.pasoRecalculo).toHaveBeenCalledTimes(2);
  });

  it('en revisión compara la IS nueva con la vigente y publica', async () => {
    const usuario = userEvent.setup();
    const nuevas = FILAS_TESIS.map((f, i) =>
      i === 0 ? { ...f, il: 4 as const, is: 4 as const } : f,
    );
    const api = crearApiFalsa({
      listarCalculos: vi
        .fn()
        .mockResolvedValue([{ ...CALCULO_IA, estado: 'completado' }, CALCULO_TESIS]),
      filasSugeridas: vi.fn((id: number) => Promise.resolve(id === 2 ? nuevas : FILAS_TESIS)),
    });
    api.obtenerCalculo
      .mockResolvedValueOnce({ ...CALCULO_IA, estado: 'completado', progreso: 18 })
      .mockResolvedValue({ ...CALCULO_IA, estado: 'publicado', vigente: true, progreso: 18 });
    montar('/admin/sugerida/2', api);

    const tabla = await screen.findByRole('table', { name: 'Resultado del recálculo' });
    await waitFor(() => expect(within(tabla).getAllByRole('row')).toHaveLength(19));
    const compatibilidad = definido(within(tabla).getAllByRole('row')[1]);
    expect(compatibilidad).toHaveTextContent('Compatibilidad');
    expect(compatibilidad).toHaveTextContent('4 · Fundamental');
    expect(compatibilidad).toHaveTextContent('3 · Importante');
    expect(compatibilidad).toHaveTextContent('la nueva es mayor');
    expect(within(tabla).getAllByRole('row')[2]).toHaveTextContent('sin cambio');

    await usuario.click(screen.getByRole('button', { name: 'Publicar como vigente' }));
    expect(api.publicar).toHaveBeenCalledWith(2);
    expect(await screen.findByText(/Publicado como vigente/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar como vigente' })).not.toBeInTheDocument();
  });

  it('descartar desde la revisión deja el cálculo descartado', async () => {
    const usuario = userEvent.setup();
    const api = crearApiFalsa();
    api.obtenerCalculo
      .mockResolvedValueOnce({ ...CALCULO_IA, estado: 'completado' })
      .mockResolvedValue({ ...CALCULO_IA, estado: 'descartado' });
    montar('/admin/sugerida/2', api);
    await usuario.click(await screen.findByRole('button', { name: 'Descartar' }));
    expect(api.descartar).toHaveBeenCalledWith(2);
    expect(await screen.findByText(/descartado/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a Importancia sugerida' })).toHaveAttribute(
      'href',
      '/admin/sugerida',
    );
  });

  it('un error de la API se muestra con un botón para reintentar', async () => {
    const api = crearApiFalsa({
      pasoRecalculo: vi.fn().mockRejectedValue(new ErrorAdmin('Sin conexión')),
    });
    montar('/admin/sugerida/2', api);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('un id que no es un número o no existe lo informa', async () => {
    const api = crearApiFalsa();
    api.obtenerCalculo.mockResolvedValue(null);
    montar('/admin/sugerida/99', api);
    expect(await screen.findByText('No existe el cálculo 99.')).toBeInTheDocument();
    montar('/admin/sugerida/abc', api);
    expect(screen.getAllByText(/No existe el cálculo/).length).toBeGreaterThan(0);
  });
});
