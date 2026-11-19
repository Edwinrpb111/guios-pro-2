import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CONFIGURACION_PRUEBA, crearApiFalsa, renderAdmin } from '../admin/pruebas';
import type { ConfiguracionRecalculo } from '../admin/tipos';
import { AdminConfiguracionPage } from './AdminConfiguracionPage';

function renderizar(api = crearApiFalsa()) {
  return renderAdmin(<AdminConfiguracionPage />, { api });
}

const claveGemini = () => within(screen.getByRole('group', { name: 'Clave de Gemini' }));
const claveOpenAlex = () => within(screen.getByRole('group', { name: 'Clave de OpenAlex' }));

describe('AdminConfiguracionPage (issue #33)', () => {
  it('muestra los parámetros guardados, el estado de las claves y los cambios recientes', async () => {
    renderizar();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Configuración del recálculo' }),
    ).toBeInTheDocument();

    expect(screen.getByLabelText('Proveedor del clasificador')).toHaveValue('gemini');
    expect(screen.getByLabelText('Modelo')).toHaveValue('gemini-3.1-flash-lite');
    expect(screen.getByLabelText(/Umbral de confianza/)).toHaveValue('0.7');
    expect(screen.getByLabelText(/Máximo de candidatos/)).toHaveValue('');
    expect(screen.getByLabelText('Correo para Crossref')).toHaveValue('equipo@unemi.edu.ec');

    expect(claveGemini().getByText(/Configurada · actualizada el 18\/11\/2026/)).toBeVisible();
    expect(claveOpenAlex().getByText('No configurada')).toBeVisible();

    const cambios = within(screen.getByRole('list', { name: 'Cambios recientes' }));
    expect(cambios.getByText(/Ada Admin/)).toBeInTheDocument();
    expect(cambios.getByText(/Clave GEMINI_API_KEY guardada/)).toBeInTheDocument();
  });

  it('los campos de clave son de solo escritura: tipo contraseña y siempre vacíos', async () => {
    renderizar();
    const campo = await screen.findByLabelText('Nueva clave de Gemini');
    expect(campo).toHaveAttribute('type', 'password');
    expect(campo).toHaveAttribute('autocomplete', 'new-password');
    expect(campo).toHaveValue('');
    expect(screen.getByLabelText('Nueva clave de OpenAlex')).toHaveValue('');
  });

  it('guarda los parámetros validados y avisa', async () => {
    const api = crearApiFalsa();
    renderizar(api);
    const maximo = await screen.findByLabelText(/Máximo de candidatos/);
    await userEvent.selectOptions(screen.getByLabelText('Proveedor del clasificador'), 'fake');
    await userEvent.clear(screen.getByLabelText(/Umbral de confianza/));
    await userEvent.type(screen.getByLabelText(/Umbral de confianza/), '0,8');
    await userEvent.type(maximo, '15');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar parámetros' }));

    await waitFor(() =>
      expect(api.guardarParametros).toHaveBeenCalledWith({
        proveedorLlm: 'fake',
        modelo: 'gemini-3.1-flash-lite',
        umbral: 0.8,
        maxCandidatos: 15,
        crossrefMailto: 'equipo@unemi.edu.ec',
      }),
    );
    expect(await screen.findByText('Parámetros guardados.')).toBeInTheDocument();
    expect(api.obtenerConfiguracion).toHaveBeenCalledTimes(2);
  });

  it('no guarda un umbral inválido y lo anuncia con role="alert"', async () => {
    const api = crearApiFalsa();
    renderizar(api);
    const umbral = await screen.findByLabelText(/Umbral de confianza/);
    await userEvent.clear(umbral);
    await userEvent.type(umbral, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar parámetros' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/umbral/i);
    expect(api.guardarParametros).not.toHaveBeenCalled();
  });

  it('guarda una clave nueva sin mostrarla y vacía el campo', async () => {
    const api = crearApiFalsa();
    renderizar(api);
    const campo = await screen.findByLabelText('Nueva clave de OpenAlex');
    await userEvent.type(campo, 'clave-super-secreta');
    await userEvent.click(claveOpenAlex().getByRole('button', { name: 'Guardar clave' }));

    await waitFor(() =>
      expect(api.guardarClave).toHaveBeenCalledWith('OPENALEX_API_KEY', 'clave-super-secreta'),
    );
    expect(await screen.findByText('Clave de OpenAlex guardada.')).toBeInTheDocument();
    expect(campo).toHaveValue('');
    expect(screen.queryByText(/clave-super-secreta/)).toBeNull();
  });

  it('una clave configurada se reemplaza o se borra tras confirmar', async () => {
    const api = crearApiFalsa();
    renderizar(api);
    await screen.findByLabelText('Nueva clave de Gemini');
    expect(claveGemini().getByRole('button', { name: 'Reemplazar clave' })).toBeInTheDocument();

    await userEvent.click(claveGemini().getByRole('button', { name: 'Borrar clave' }));
    expect(api.borrarClave).not.toHaveBeenCalled();
    await userEvent.click(claveGemini().getByRole('button', { name: 'Sí, borrar GEMINI_API_KEY' }));

    await waitFor(() => expect(api.borrarClave).toHaveBeenCalledWith('GEMINI_API_KEY'));
    expect(await screen.findByText('Clave de Gemini borrada.')).toBeInTheDocument();
  });

  it('cancelar el borrado no borra la clave', async () => {
    const api = crearApiFalsa();
    renderizar(api);
    await screen.findByLabelText('Nueva clave de Gemini');
    await userEvent.click(claveGemini().getByRole('button', { name: 'Borrar clave' }));
    await userEvent.click(claveGemini().getByRole('button', { name: 'Cancelar' }));
    expect(claveGemini().getByRole('button', { name: 'Borrar clave' })).toBeInTheDocument();
    expect(api.borrarClave).not.toHaveBeenCalled();
  });

  it('una clave sin configurar no se puede borrar y una vacía no se envía', async () => {
    const api = crearApiFalsa();
    renderizar(api);
    await screen.findByLabelText('Nueva clave de OpenAlex');
    expect(claveOpenAlex().queryByRole('button', { name: 'Borrar clave' })).toBeNull();
    await userEvent.click(claveOpenAlex().getByRole('button', { name: 'Guardar clave' }));
    expect(await claveOpenAlex().findByRole('alert')).toHaveTextContent(/clave/i);
    expect(api.guardarClave).not.toHaveBeenCalled();
  });

  it('si la base rechaza el cambio, muestra el mensaje', async () => {
    const api = crearApiFalsa({
      guardarParametros: vi.fn().mockRejectedValue(new Error('Solo un administrador puede…')),
    });
    renderizar(api);
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar parámetros' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Solo un administrador puede…');
  });

  it('si no se puede leer la configuración, lo anuncia y ofrece reintentar', async () => {
    const api = crearApiFalsa({
      obtenerConfiguracion: vi
        .fn()
        .mockRejectedValueOnce(new Error('Sin conexión'))
        .mockResolvedValue(CONFIGURACION_PRUEBA),
    });
    renderizar(api);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByLabelText('Modelo')).toHaveValue('gemini-3.1-flash-lite');
  });

  it('sin valores guardados los campos quedan vacíos e indican qué se usa en su lugar', async () => {
    const vacia: ConfiguracionRecalculo = {
      ...CONFIGURACION_PRUEBA,
      parametros: {
        proveedorLlm: null,
        modelo: null,
        umbral: null,
        maxCandidatos: null,
        crossrefMailto: null,
      },
      cambios: [],
    };
    renderizar(crearApiFalsa({ obtenerConfiguracion: vi.fn().mockResolvedValue(vacia) }));
    expect(await screen.findByLabelText('Proveedor del clasificador')).toHaveValue('');
    expect(screen.getByRole('option', { name: /secreto de Supabase/ })).toBeInTheDocument();
    expect(screen.getByText('Todavía no hay cambios.')).toBeInTheDocument();
  });
});
