import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CONFIGURACION_PRUEBA, crearApiFalsa, renderAdmin } from '../admin/pruebas';
import type { ConfiguracionRecalculo, ParametrosRecalculo } from '../admin/tipos';
import { AdminConfiguracionPage } from './AdminConfiguracionPage';

function renderizar(api = crearApiFalsa()) {
  return renderAdmin(<AdminConfiguracionPage />, { api });
}

const SIN_CLAVES = [
  { nombre: 'GEMINI_API_KEY', configurada: false, actualizadaEn: null },
  { nombre: 'OPENALEX_API_KEY', configurada: false, actualizadaEn: null },
] as const;

/** API falsa con otros parámetros guardados y, opcionalmente, sin la clave de Gemini. */
function apiCon(parametros: Partial<ParametrosRecalculo>, conClaveGemini = true) {
  const configuracion: ConfiguracionRecalculo = {
    ...CONFIGURACION_PRUEBA,
    parametros: { ...CONFIGURACION_PRUEBA.parametros, ...parametros },
    claves: conClaveGemini ? CONFIGURACION_PRUEBA.claves : [...SIN_CLAVES],
  };
  return crearApiFalsa({ obtenerConfiguracion: vi.fn().mockResolvedValue(configuracion) });
}

const resumen = async () =>
  within(await screen.findByRole('region', { name: 'Qué va a usar el recálculo' }));
const proveedor = () =>
  within(screen.getByRole('radiogroup', { name: 'Proveedor del clasificador' }));
const abrirAvanzadas = async () => {
  await userEvent.click(await screen.findByText('Opciones avanzadas'));
};

const claveGemini = () => within(screen.getByRole('group', { name: 'Clave de Gemini' }));
const claveOpenAlex = () => within(screen.getByRole('group', { name: 'Clave de OpenAlex' }));

describe('AdminConfiguracionPage (issue #33)', () => {
  it('muestra los parámetros guardados, el estado de las claves y los cambios recientes', async () => {
    renderizar();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Configuración del recálculo' }),
    ).toBeInTheDocument();

    expect(proveedor().getByRole('radio', { name: 'Gemini' })).toBeChecked();
    expect(proveedor().getByRole('radio', { name: 'Falso (demostración)' })).not.toBeChecked();
    await abrirAvanzadas();
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
    await userEvent.click(await screen.findByRole('radio', { name: 'Falso (demostración)' }));
    await abrirAvanzadas();
    const maximo = screen.getByLabelText(/Máximo de candidatos/);
    await userEvent.clear(screen.getByLabelText(/Umbral de confianza/));
    await userEvent.type(screen.getByLabelText(/Umbral de confianza/), '0,8');
    await userEvent.type(maximo, '15');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

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
    await abrirAvanzadas();
    const umbral = await screen.findByLabelText(/Umbral de confianza/);
    await userEvent.clear(umbral);
    await userEvent.type(umbral, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/umbral/i);
    expect(api.guardarParametros).not.toHaveBeenCalled();
  });

  it('un error en las opciones avanzadas las abre aunque estuvieran plegadas', async () => {
    renderizar();
    await abrirAvanzadas();
    await userEvent.type(screen.getByLabelText('Modelo'), ' modelo/malo');
    await userEvent.click(screen.getByText('Opciones avanzadas'));
    expect(screen.getByLabelText('Modelo')).not.toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/El modelo solo admite/);
    expect(screen.getByLabelText('Modelo')).toBeVisible();
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
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar configuración' }));
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
    await abrirAvanzadas();
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
    await abrirAvanzadas();
    expect(await screen.findByRole('radio', { name: /Usar el secreto de Supabase/ })).toBeChecked();
    expect(proveedor().getByRole('radio', { name: 'Gemini' })).not.toBeChecked();
    expect(proveedor().getByRole('radio', { name: 'Falso (demostración)' })).not.toBeChecked();
    expect(screen.getByLabelText('Modelo')).toHaveValue('');
    expect(screen.getByText('Todavía no hay cambios.')).toBeInTheDocument();
  });

  describe('aviso de clave guardada que no se usa (S12)', () => {
    it.each([
      ['sin fijar', null, /lo decide el secreto LLM_PROVIDER/i],
      ['falso', 'fake', /clasificador falso/i],
    ] as const)(
      'con el proveedor %s avisa y «Usar Gemini» lo fija en un clic',
      async (_, valor, motivo) => {
        const api = apiCon({
          proveedorLlm: valor,
          modelo: 'gemini-x',
          umbral: 0.9,
          maxCandidatos: 30,
        });
        renderizar(api);
        const aviso = within(await screen.findByRole('status', { name: 'Clave sin usar' }));
        expect(aviso.getByText(/clave de Gemini guardada/i)).toBeInTheDocument();
        expect(aviso.getByText(motivo)).toBeInTheDocument();

        await userEvent.click(aviso.getByRole('button', { name: 'Usar Gemini' }));
        await waitFor(() =>
          expect(api.guardarParametros).toHaveBeenCalledWith({
            proveedorLlm: 'gemini',
            modelo: 'gemini-x',
            umbral: 0.9,
            maxCandidatos: 30,
            crossrefMailto: 'equipo@unemi.edu.ec',
          }),
        );
        expect(await screen.findByText(/El recálculo usará Gemini/)).toBeInTheDocument();
        expect(proveedor().getByRole('radio', { name: 'Gemini' })).toBeChecked();
      },
    );

    it('no avisa con Gemini fijado, ni si la clave de Gemini no está guardada', async () => {
      const { unmount } = renderizar();
      await resumen();
      expect(screen.queryByRole('status', { name: 'Clave sin usar' })).toBeNull();
      unmount();
      renderizar(apiCon({ proveedorLlm: 'fake' }, false));
      await resumen();
      expect(screen.queryByRole('status', { name: 'Clave sin usar' })).toBeNull();
    });

    it('si la base rechaza el cambio, lo anuncia en el aviso', async () => {
      const api = apiCon({ proveedorLlm: null });
      api.guardarParametros.mockRejectedValue(new Error('Solo un administrador puede…'));
      renderizar(api);
      await userEvent.click(await screen.findByRole('button', { name: 'Usar Gemini' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Solo un administrador puede…');
    });
  });

  describe('elección guiada del clasificador (S12)', () => {
    it('al elegir Gemini aparece su clave en el mismo bloque; con Falso no hay claves', async () => {
      renderizar(apiCon({ proveedorLlm: 'fake' }, false));
      const bloque = within(await screen.findByRole('group', { name: 'Clasificador' }));
      expect(bloque.queryByRole('group', { name: 'Clave de Gemini' })).toBeNull();
      expect(screen.queryByLabelText('Nueva clave de Gemini')).toBeNull();

      await userEvent.click(bloque.getByRole('radio', { name: 'Gemini' }));
      expect(bloque.getByRole('group', { name: 'Clave de Gemini' })).toBeInTheDocument();
      expect(bloque.getAllByText('No configurada')).toHaveLength(2);
      expect(bloque.getByRole('group', { name: 'Clave de OpenAlex' })).toBeInTheDocument();
      expect(bloque.getByText(/Crossref funciona sin clave/)).toBeInTheDocument();

      await userEvent.click(bloque.getByRole('radio', { name: 'Falso (demostración)' }));
      expect(bloque.queryByRole('group', { name: 'Clave de Gemini' })).toBeNull();
      expect(bloque.queryByRole('group', { name: 'Clave de OpenAlex' })).toBeNull();
    });

    it('las opciones se eligen con el teclado', async () => {
      renderizar();
      const gemini = await screen.findByRole('radio', { name: 'Gemini' });
      gemini.focus();
      await userEvent.keyboard('{ArrowDown}');
      expect(screen.getByRole('radio', { name: 'Falso (demostración)' })).toBeChecked();
    });

    it('guardar la elección persiste el proveedor con los demás parámetros', async () => {
      const api = apiCon({ proveedorLlm: null });
      renderizar(api);
      await userEvent.click(await screen.findByRole('radio', { name: 'Falso (demostración)' }));
      await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
      await waitFor(() =>
        expect(api.guardarParametros).toHaveBeenCalledWith({
          ...CONFIGURACION_PRUEBA.parametros,
          proveedorLlm: 'fake',
        }),
      );
    });

    it('sin elección dice que decide el secreto de Supabase y pide elegir una', async () => {
      renderizar(apiCon({ proveedorLlm: null }));
      expect(await screen.findByText(/Ahora no hay ninguna opción elegida/)).toBeInTheDocument();
    });

    it('pulsar Intro en la clave guarda la clave y no los parámetros', async () => {
      const api = crearApiFalsa();
      renderizar(api);
      await userEvent.type(await screen.findByLabelText('Nueva clave de OpenAlex'), 'abc{Enter}');
      await waitFor(() => expect(api.guardarClave).toHaveBeenCalledWith('OPENALEX_API_KEY', 'abc'));
      expect(api.guardarParametros).not.toHaveBeenCalled();
    });
  });

  describe('opciones avanzadas (S12)', () => {
    it('están plegadas por defecto y se despliegan con su título', async () => {
      renderizar();
      const titulo = await screen.findByText('Opciones avanzadas');
      expect(titulo.closest('details')).not.toHaveAttribute('open');
      expect(screen.getByLabelText('Modelo')).not.toBeVisible();
      expect(screen.getByLabelText(/Umbral de confianza/)).not.toBeVisible();
      expect(screen.getByLabelText(/Máximo de candidatos/)).not.toBeVisible();
      expect(screen.getByLabelText('Correo para Crossref')).not.toBeVisible();
      expect(screen.getByRole('radio', { name: /Usar el secreto de Supabase/ })).not.toBeVisible();

      await userEvent.click(titulo);
      expect(screen.getByLabelText('Modelo')).toBeVisible();
      expect(screen.getByRole('radio', { name: /Usar el secreto de Supabase/ })).toBeVisible();
    });

    it('siguen validando: un modelo con caracteres no permitidos no se guarda', async () => {
      const api = crearApiFalsa();
      renderizar(api);
      await abrirAvanzadas();
      const modelo = screen.getByLabelText('Modelo');
      await userEvent.clear(modelo);
      await userEvent.type(modelo, 'modelo/malo');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/El modelo solo admite/);
      expect(api.guardarParametros).not.toHaveBeenCalled();
    });

    it('elegir el secreto de Supabase guarda el proveedor sin fijar (null)', async () => {
      const api = crearApiFalsa();
      renderizar(api);
      await abrirAvanzadas();
      await userEvent.click(screen.getByRole('radio', { name: /Usar el secreto de Supabase/ }));
      expect(proveedor().getByRole('radio', { name: 'Gemini' })).not.toBeChecked();
      await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
      await waitFor(() =>
        expect(api.guardarParametros).toHaveBeenCalledWith({
          ...CONFIGURACION_PRUEBA.parametros,
          proveedorLlm: null,
        }),
      );
    });
  });

  describe('resumen «Qué va a usar el recálculo» (S12)', () => {
    it('Gemini con clave guardada: valores por defecto indicados y clave guardada en la app', async () => {
      renderizar(apiCon({ proveedorLlm: 'gemini', modelo: null }));
      const caja = await resumen();
      expect(
        caja.getByText(
          'Gemini · modelo gemini-3.1-flash-lite (por defecto) · umbral 0,7 · máx. 50 candidatos (por defecto) · clave guardada en la app',
        ),
      ).toBeInTheDocument();
      expect(caja.getByText(/Un valor «por defecto» puede cambiarse con un secreto/)).toBeVisible();
      expect(caja.queryByText(/el recálculo fallará/)).toBeNull();
    });

    it('Gemini con todo definido no muestra «por defecto»', async () => {
      renderizar(apiCon({ modelo: 'gemini-x', umbral: 0.5, maxCandidatos: 20 }));
      const caja = await resumen();
      expect(
        caja.getByText(
          'Gemini · modelo gemini-x · umbral 0,5 · máx. 20 candidatos · clave guardada en la app',
        ),
      ).toBeInTheDocument();
      expect(caja.queryByText(/por defecto/)).toBeNull();
    });

    it('Gemini sin clave guardada: advierte que usará el secreto de Supabase o fallará', async () => {
      renderizar(apiCon({ proveedorLlm: 'gemini' }, false));
      const caja = await resumen();
      expect(caja.getByText(/Gemini · modelo gemini-3\.1-flash-lite/)).toBeInTheDocument();
      expect(caja.getByText(/clave no guardada en la app/)).toBeInTheDocument();
      expect(
        caja.getByText(
          /usará GEMINI_API_KEY de los secretos de Supabase si existe; si no, el recálculo fallará/,
        ),
      ).toBeInTheDocument();
    });

    it('Falso: demostración, sin red ni claves', async () => {
      renderizar(apiCon({ proveedorLlm: 'fake' }));
      const caja = await resumen();
      expect(
        caja.getByText('Clasificador falso (demostración, sin red ni claves)'),
      ).toBeInTheDocument();
      expect(caja.queryByText(/Gemini/)).toBeNull();
    });

    it('sin proveedor: lo decide el secreto LLM_PROVIDER, que la app no puede ver', async () => {
      renderizar(apiCon({ proveedorLlm: null }));
      const caja = await resumen();
      expect(
        caja.getByText(/lo decide el secreto LLM_PROVIDER de Supabase, que la app no puede ver/),
      ).toBeInTheDocument();
      expect(caja.getByText(/elige Gemini o Falso/i)).toBeInTheDocument();
    });

    it('refleja lo guardado, no lo que se está editando', async () => {
      renderizar(apiCon({ proveedorLlm: 'fake' }));
      await userEvent.click(await screen.findByRole('radio', { name: 'Gemini' }));
      expect(
        (await resumen()).getByText('Clasificador falso (demostración, sin red ni claves)'),
      ).toBeInTheDocument();
    });
  });
});
