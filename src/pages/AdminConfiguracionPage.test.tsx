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
    expect(screen.getByLabelText('Llamadas a la IA por minuto')).toHaveValue('');
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
    await userEvent.type(screen.getByLabelText('Llamadas a la IA por minuto'), '30');
    await userEvent.type(screen.getByLabelText('Llamadas simultáneas a la IA (1 a 10)'), '4');
    await userEvent.click(screen.getByLabelText('Desactivar razonamiento del modelo'));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    await waitFor(() =>
      expect(api.guardarParametros).toHaveBeenCalledWith({
        proveedorLlm: 'fake',
        modelo: 'gemini-3.1-flash-lite',
        umbral: 0.8,
        maxCandidatos: 15,
        llamadasPorMinuto: 30,
        llamadasSimultaneas: 4,
        desactivarRazonamiento: true,
        crossrefMailto: 'equipo@unemi.edu.ec',
        openaiBaseUrl: null,
        openaiModelo: null,
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

  it('no guarda un ritmo fuera de 1 a 1000 y lo anuncia con role="alert"', async () => {
    const api = crearApiFalsa();
    renderizar(api);
    await abrirAvanzadas();
    await userEvent.type(await screen.findByLabelText('Llamadas a la IA por minuto'), '1001');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/llamadas por minuto/i);
    expect(api.guardarParametros).not.toHaveBeenCalled();
  });

  it('muestra «Llamadas simultáneas» y «Desactivar razonamiento» con lo guardado (issue #45)', async () => {
    renderizar(apiCon({ llamadasSimultaneas: 3, desactivarRazonamiento: true }));
    await abrirAvanzadas();
    expect(await screen.findByLabelText('Llamadas simultáneas a la IA (1 a 10)')).toHaveValue('3');
    expect(screen.getByLabelText('Desactivar razonamiento del modelo')).toBeChecked();
  });

  it('sin valores, llamadas simultáneas vacío con «5» de ejemplo y razonamiento sin marcar', async () => {
    renderizar();
    await abrirAvanzadas();
    const campo = await screen.findByLabelText('Llamadas simultáneas a la IA (1 a 10)');
    expect(campo).toHaveValue('');
    expect(campo).toHaveAttribute('placeholder', '5');
    expect(campo).toHaveAccessibleDescription(/vacío.*5/i);
    expect(screen.getByLabelText('Desactivar razonamiento del modelo')).not.toBeChecked();
  });

  it('el razonamiento explica para qué servicios vale y que con otros no se envía nada', async () => {
    renderizar();
    await abrirAvanzadas();
    const casilla = await screen.findByLabelText('Desactivar razonamiento del modelo');
    expect(casilla).toHaveAccessibleDescription(/DeepSeek, OpenRouter y Gemini/);
    expect(casilla).toHaveAccessibleDescription(/otros servicios no se envía nada/);
  });

  it.each(['0', '11', '2,5', 'todas'])(
    'no guarda %s llamadas simultáneas y lo anuncia con role="alert"',
    async (valor) => {
      const api = crearApiFalsa();
      renderizar(api);
      await abrirAvanzadas();
      await userEvent.type(
        await screen.findByLabelText('Llamadas simultáneas a la IA (1 a 10)'),
        valor,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/llamadas simultáneas.*1 y 10/i);
      expect(api.guardarParametros).not.toHaveBeenCalled();
    },
  );

  it('el resumen incluye las llamadas simultáneas y avisa si el razonamiento está desactivado', async () => {
    renderizar(apiCon({ llamadasSimultaneas: 1, desactivarRazonamiento: true }));
    const caja = await resumen();
    expect(
      caja.getByText(/1 llamada simultánea · razonamiento desactivado · clave guardada/),
    ).toBeInTheDocument();
    expect(caja.getByText(/LLM_LLAMADAS_SIMULTANEAS/)).toBeInTheDocument();
  });

  it('explica el ritmo: plan gratis cerca de 15 y que con facturación se puede subir', async () => {
    renderizar();
    await abrirAvanzadas();
    const campo = await screen.findByLabelText('Llamadas a la IA por minuto');
    expect(campo).toHaveAccessibleDescription(/plan gratis.*15.*facturación.*subir/i);
    expect(campo).toHaveAttribute('placeholder', '15');
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
        llamadasPorMinuto: null,
        llamadasSimultaneas: null,
        desactivarRazonamiento: null,
        crossrefMailto: null,
        openaiBaseUrl: null,
        openaiModelo: null,
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
          llamadasPorMinuto: 20,
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
            llamadasPorMinuto: 20,
            llamadasSimultaneas: null,
            desactivarRazonamiento: null,
            crossrefMailto: 'equipo@unemi.edu.ec',
            openaiBaseUrl: null,
            openaiModelo: null,
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
      expect(screen.getByLabelText('Llamadas a la IA por minuto')).not.toBeVisible();
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
          'Gemini · modelo gemini-3.1-flash-lite (por defecto) · umbral 0,7 · máx. 50 candidatos (por defecto) · 15 llamadas por minuto (por defecto) · 5 llamadas simultáneas (por defecto) · clave guardada en la app',
        ),
      ).toBeInTheDocument();
      expect(caja.getByText(/Un valor «por defecto» puede cambiarse con un secreto/)).toBeVisible();
      expect(caja.queryByText(/el recálculo fallará/)).toBeNull();
    });

    it('Gemini con todo definido no muestra «por defecto»', async () => {
      renderizar(
        apiCon({
          modelo: 'gemini-x',
          umbral: 0.5,
          maxCandidatos: 20,
          llamadasPorMinuto: 60,
          llamadasSimultaneas: 4,
        }),
      );
      const caja = await resumen();
      expect(
        caja.getByText(
          'Gemini · modelo gemini-x · umbral 0,5 · máx. 20 candidatos · 60 llamadas por minuto · 4 llamadas simultáneas · clave guardada en la app',
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
      expect(caja.getByText(/elige Gemini, Compatible con OpenAI o Falso/i)).toBeInTheDocument();
    });

    it('refleja lo guardado, no lo que se está editando', async () => {
      renderizar(apiCon({ proveedorLlm: 'fake' }));
      await userEvent.click(await screen.findByRole('radio', { name: 'Gemini' }));
      expect(
        (await resumen()).getByText('Clasificador falso (demostración, sin red ni claves)'),
      ).toBeInTheDocument();
    });
  });

  describe('proveedor compatible con OpenAI (S14, issue #40)', () => {
    const OPCION = 'Compatible con OpenAI (OpenRouter, Groq, DeepSeek…)';
    const claveCompat = () =>
      within(screen.getByRole('group', { name: 'Clave de la IA compatible con OpenAI' }));
    const CLAVE_COMPAT_GUARDADA = {
      nombre: 'OPENAI_COMPAT_API_KEY',
      configurada: true,
      actualizadaEn: '2026-11-19T15:00:00Z',
    } as const;
    const CLAVE_GEMINI_GUARDADA = {
      nombre: 'GEMINI_API_KEY',
      configurada: true,
      actualizadaEn: '2026-11-18T15:00:00Z',
    } as const;
    const SOLO_COMPAT = [SIN_CLAVES[0], CLAVE_COMPAT_GUARDADA, SIN_CLAVES[1]];
    const GROQ = {
      proveedorLlm: 'openai',
      openaiBaseUrl: 'https://api.groq.com/openai/v1',
      openaiModelo: 'llama-3.3-70b-versatile',
    } as const;

    /** API falsa con otros parámetros y el estado de claves indicado. */
    function apiConClaves(
      parametros: Partial<ParametrosRecalculo>,
      claves: ConfiguracionRecalculo['claves'],
    ) {
      const configuracion: ConfiguracionRecalculo = {
        ...CONFIGURACION_PRUEBA,
        parametros: { ...CONFIGURACION_PRUEBA.parametros, ...parametros },
        claves,
      };
      return crearApiFalsa({ obtenerConfiguracion: vi.fn().mockResolvedValue(configuracion) });
    }

    it('ofrece una tercera opción grande junto a Gemini y Falso', async () => {
      renderizar();
      await screen.findByRole('radio', { name: 'Gemini' });
      expect(proveedor().getAllByRole('radio')).toHaveLength(3);
      expect(proveedor().getByRole('radio', { name: OPCION })).not.toBeChecked();
      expect(
        proveedor().getByText(/Servicios baratos o gratis con el formato de OpenAI/),
      ).toBeInTheDocument();
    });

    it('al elegirla aparecen dirección, modelo y clave en el mismo bloque, con ejemplos', async () => {
      renderizar(apiCon({ proveedorLlm: 'fake' }, false));
      const bloque = within(await screen.findByRole('group', { name: 'Clasificador' }));
      expect(bloque.queryByLabelText('Dirección base (https)')).toBeNull();
      expect(bloque.queryByLabelText('Modelo de la IA compatible')).toBeNull();
      expect(
        bloque.queryByRole('group', { name: 'Clave de la IA compatible con OpenAI' }),
      ).toBeNull();

      await userEvent.click(bloque.getByRole('radio', { name: OPCION }));
      expect(bloque.getByLabelText('Dirección base (https)')).toHaveValue('');
      expect(bloque.getByLabelText('Modelo de la IA compatible')).toHaveValue('');
      const clave = within(
        bloque.getByRole('group', { name: 'Clave de la IA compatible con OpenAI' }),
      );
      expect(clave.getByText('OPENAI_COMPAT_API_KEY')).toBeInTheDocument();
      expect(clave.getByText('No configurada')).toBeInTheDocument();
      expect(bloque.getByRole('group', { name: 'Clave de OpenAlex' })).toBeInTheDocument();
      // No aparece la clave de Gemini.
      expect(bloque.queryByRole('group', { name: 'Clave de Gemini' })).toBeNull();
      // Ejemplos de direcciones.
      expect(bloque.getByText('https://openrouter.ai/api/v1')).toBeInTheDocument();
      expect(bloque.getByText('https://api.groq.com/openai/v1')).toBeInTheDocument();
      expect(bloque.getByText('https://api.deepseek.com')).toBeInTheDocument();

      await userEvent.click(bloque.getByRole('radio', { name: 'Gemini' }));
      expect(bloque.queryByLabelText('Dirección base (https)')).toBeNull();
      expect(bloque.getByRole('group', { name: 'Clave de Gemini' })).toBeInTheDocument();
      expect(
        bloque.queryByRole('group', { name: 'Clave de la IA compatible con OpenAI' }),
      ).toBeNull();
    });

    it('muestra lo guardado y la clave nunca se muestra: campo de contraseña vacío', async () => {
      renderizar(apiConClaves(GROQ, SOLO_COMPAT));
      expect(await screen.findByLabelText('Dirección base (https)')).toHaveValue(
        'https://api.groq.com/openai/v1',
      );
      expect(screen.getByLabelText('Modelo de la IA compatible')).toHaveValue(
        'llama-3.3-70b-versatile',
      );
      expect(proveedor().getByRole('radio', { name: OPCION })).toBeChecked();
      const campo = screen.getByLabelText('Nueva clave de la IA compatible con OpenAI');
      expect(campo).toHaveAttribute('type', 'password');
      expect(campo).toHaveAttribute('autocomplete', 'new-password');
      expect(campo).toHaveValue('');
      expect(claveCompat().getByText(/Configurada · actualizada el 19\/11\/2026/)).toBeVisible();
    });

    it('guarda proveedor, dirección (sin «/» final) y modelo con los demás parámetros', async () => {
      const api = apiCon({ proveedorLlm: null });
      renderizar(api);
      await userEvent.click(await screen.findByRole('radio', { name: OPCION }));
      await userEvent.type(
        screen.getByLabelText('Dirección base (https)'),
        'https://openrouter.ai/api/v1/',
      );
      await userEvent.type(
        screen.getByLabelText('Modelo de la IA compatible'),
        'meta-llama/llama-3.3-70b-instruct:free',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
      await waitFor(() =>
        expect(api.guardarParametros).toHaveBeenCalledWith({
          ...CONFIGURACION_PRUEBA.parametros,
          proveedorLlm: 'openai',
          openaiBaseUrl: 'https://openrouter.ai/api/v1',
          openaiModelo: 'meta-llama/llama-3.3-70b-instruct:free',
        }),
      );
    });

    it('no guarda una dirección que no sea https y lo anuncia con role="alert"', async () => {
      const api = crearApiFalsa();
      renderizar(api);
      await userEvent.click(await screen.findByRole('radio', { name: OPCION }));
      await userEvent.type(
        screen.getByLabelText('Dirección base (https)'),
        'http://api.groq.com/openai/v1',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/https/i);
      expect(api.guardarParametros).not.toHaveBeenCalled();
    });

    it('no guarda una dirección con usuario y clave ni la repite en el aviso', async () => {
      const api = crearApiFalsa();
      renderizar(api);
      await userEvent.click(await screen.findByRole('radio', { name: OPCION }));
      await userEvent.type(
        screen.getByLabelText('Dirección base (https)'),
        'https://jose:secreto123@api.groq.com/v1',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
      const alerta = await screen.findByRole('alert');
      expect(alerta).toHaveTextContent(/usuario|clave|credenciales/i);
      expect(alerta).not.toHaveTextContent('secreto123');
      expect(api.guardarParametros).not.toHaveBeenCalled();
    });

    it('no guarda un modelo con caracteres no permitidos', async () => {
      const api = crearApiFalsa();
      renderizar(api);
      await userEvent.click(await screen.findByRole('radio', { name: OPCION }));
      await userEvent.type(screen.getByLabelText('Modelo de la IA compatible'), 'modelo malo');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/modelo/i);
      expect(api.guardarParametros).not.toHaveBeenCalled();
    });

    it('guarda la clave sin mostrarla y vacía el campo', async () => {
      const api = apiConClaves(GROQ, [SIN_CLAVES[0], SIN_CLAVES[1]]);
      renderizar(api);
      const campo = await screen.findByLabelText('Nueva clave de la IA compatible con OpenAI');
      await userEvent.type(campo, 'sk-super-secreta');
      await userEvent.click(claveCompat().getByRole('button', { name: 'Guardar clave' }));
      await waitFor(() =>
        expect(api.guardarClave).toHaveBeenCalledWith('OPENAI_COMPAT_API_KEY', 'sk-super-secreta'),
      );
      expect(
        await screen.findByText('Clave de la IA compatible con OpenAI guardada.'),
      ).toBeInTheDocument();
      expect(campo).toHaveValue('');
      expect(screen.queryByText(/sk-super-secreta/)).toBeNull();
      expect(api.guardarParametros).not.toHaveBeenCalled();
    });

    it('una clave configurada se reemplaza o se borra tras confirmar', async () => {
      const api = apiConClaves(GROQ, SOLO_COMPAT);
      renderizar(api);
      await screen.findByLabelText('Nueva clave de la IA compatible con OpenAI');
      expect(claveCompat().getByRole('button', { name: 'Reemplazar clave' })).toBeInTheDocument();
      await userEvent.click(claveCompat().getByRole('button', { name: 'Borrar clave' }));
      expect(api.borrarClave).not.toHaveBeenCalled();
      await userEvent.click(
        claveCompat().getByRole('button', { name: 'Sí, borrar OPENAI_COMPAT_API_KEY' }),
      );
      await waitFor(() => expect(api.borrarClave).toHaveBeenCalledWith('OPENAI_COMPAT_API_KEY'));
      expect(
        await screen.findByText('Clave de la IA compatible con OpenAI borrada.'),
      ).toBeInTheDocument();
    });

    it('pulsar Intro en la clave guarda la clave y no los parámetros', async () => {
      const api = apiConClaves(GROQ, [SIN_CLAVES[0], SIN_CLAVES[1]]);
      renderizar(api);
      await userEvent.type(
        await screen.findByLabelText('Nueva clave de la IA compatible con OpenAI'),
        'abc{Enter}',
      );
      await waitFor(() =>
        expect(api.guardarClave).toHaveBeenCalledWith('OPENAI_COMPAT_API_KEY', 'abc'),
      );
      expect(api.guardarParametros).not.toHaveBeenCalled();
    });

    it('«Llamadas a la IA por minuto» vale también para este proveedor', async () => {
      const api = apiConClaves(GROQ, SOLO_COMPAT);
      renderizar(api);
      await abrirAvanzadas();
      await userEvent.type(await screen.findByLabelText('Llamadas a la IA por minuto'), '30');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
      await waitFor(() =>
        expect(api.guardarParametros).toHaveBeenCalledWith(
          expect.objectContaining({ proveedorLlm: 'openai', llamadasPorMinuto: 30 }),
        ),
      );
    });

    describe('resumen «Qué va a usar el recálculo»', () => {
      it('muestra «Compatible con OpenAI · modelo · servidor» y que la clave está guardada', async () => {
        renderizar(apiConClaves({ ...GROQ, umbral: 0.7 }, SOLO_COMPAT));
        const caja = await resumen();
        expect(
          caja.getByText(
            'Compatible con OpenAI · llama-3.3-70b-versatile · api.groq.com · umbral 0,7 · máx. 50 candidatos (por defecto) · 15 llamadas por minuto (por defecto) · 5 llamadas simultáneas (por defecto) · clave guardada en la app',
          ),
        ).toBeInTheDocument();
        expect(caja.queryByText(/el recálculo fallará/)).toBeNull();
        expect(caja.queryByText(/Gemini/)).toBeNull();
      });

      it('sin clave guardada advierte que usará el secreto de Supabase o fallará', async () => {
        renderizar(apiConClaves(GROQ, [SIN_CLAVES[0], SIN_CLAVES[1]]));
        const caja = await resumen();
        expect(
          caja.getByText(/Compatible con OpenAI · llama-3\.3-70b-versatile · api\.groq\.com/),
        ).toBeInTheDocument();
        expect(caja.getByText(/clave no guardada en la app/)).toBeInTheDocument();
        expect(
          caja.getByText(
            /usará OPENAI_COMPAT_API_KEY de los secretos de Supabase si existe; si no, el recálculo fallará/,
          ),
        ).toBeInTheDocument();
      });

      it('sin dirección ni modelo guardados dice que salen de los secretos de Supabase', async () => {
        renderizar(
          apiConClaves(
            { proveedorLlm: 'openai', openaiBaseUrl: null, openaiModelo: null },
            SOLO_COMPAT,
          ),
        );
        const caja = await resumen();
        expect(
          caja.getByText(
            /Compatible con OpenAI · modelo del secreto OPENAI_COMPAT_MODEL · dirección del secreto OPENAI_COMPAT_BASE_URL/,
          ),
        ).toBeInTheDocument();
        expect(
          caja.getByText(
            /OPENAI_COMPAT_BASE_URL y OPENAI_COMPAT_MODEL de los secretos de Supabase; si faltan, el recálculo fallará/,
          ),
        ).toBeInTheDocument();
      });

      it('con todo definido no muestra «por defecto»', async () => {
        renderizar(
          apiConClaves(
            {
              ...GROQ,
              umbral: 0.5,
              maxCandidatos: 20,
              llamadasPorMinuto: 60,
              llamadasSimultaneas: 4,
            },
            SOLO_COMPAT,
          ),
        );
        const caja = await resumen();
        expect(
          caja.getByText(
            'Compatible con OpenAI · llama-3.3-70b-versatile · api.groq.com · umbral 0,5 · máx. 20 candidatos · 60 llamadas por minuto · 4 llamadas simultáneas · clave guardada en la app',
          ),
        ).toBeInTheDocument();
        expect(caja.queryByText(/por defecto/)).toBeNull();
      });
    });

    describe('aviso de clave guardada que no se usa', () => {
      it('con Falso y una clave del compatible guardada avisa y «Usar…» lo fija en un clic', async () => {
        const api = apiConClaves({ ...GROQ, proveedorLlm: 'fake', umbral: 0.9 }, SOLO_COMPAT);
        renderizar(api);
        const aviso = within(await screen.findByRole('status', { name: 'Clave sin usar' }));
        expect(
          aviso.getByText(/clave de la IA compatible con OpenAI guardada/i),
        ).toBeInTheDocument();
        expect(aviso.getByText(/clasificador falso/i)).toBeInTheDocument();

        await userEvent.click(
          aviso.getByRole('button', { name: 'Usar el proveedor compatible con OpenAI' }),
        );
        await waitFor(() =>
          expect(api.guardarParametros).toHaveBeenCalledWith({
            ...CONFIGURACION_PRUEBA.parametros,
            ...GROQ,
            umbral: 0.9,
          }),
        );
        expect(
          await screen.findByText(/El recálculo usará el proveedor compatible/),
        ).toBeInTheDocument();
        expect(proveedor().getByRole('radio', { name: OPCION })).toBeChecked();
      });

      it('con Gemini fijado avisa por la clave del compatible y nombra el proveedor guardado', async () => {
        renderizar(apiConClaves({ proveedorLlm: 'gemini' }, SOLO_COMPAT));
        const aviso = within(await screen.findByRole('status', { name: 'Clave sin usar' }));
        expect(aviso.getByText(/el proveedor guardado es Gemini/i)).toBeInTheDocument();
      });

      it('con el compatible fijado no avisa por su propia clave', async () => {
        renderizar(apiConClaves(GROQ, SOLO_COMPAT));
        await resumen();
        expect(screen.queryByRole('status', { name: 'Clave sin usar' })).toBeNull();
      });

      it('con el compatible fijado avisa por una clave de Gemini guardada', async () => {
        renderizar(
          apiConClaves(GROQ, [CLAVE_GEMINI_GUARDADA, CLAVE_COMPAT_GUARDADA, SIN_CLAVES[1]]),
        );
        const aviso = within(await screen.findByRole('status', { name: 'Clave sin usar' }));
        expect(aviso.getByText(/clave de Gemini guardada/i)).toBeInTheDocument();
        expect(aviso.getByText(/compatible con OpenAI/i)).toBeInTheDocument();
        expect(aviso.getByRole('button', { name: 'Usar Gemini' })).toBeInTheDocument();
      });
    });
  });
});
