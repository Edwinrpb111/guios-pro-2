import { screen, within } from '@testing-library/react';
import { CONFIGURACION_PRUEBA, crearApiFalsa, renderAdmin } from '../admin/pruebas';
import type { ConfiguracionRecalculo } from '../admin/tipos';
import { AdminNuevoRecalculoPage } from './AdminNuevoRecalculoPage';

function con(configuracion: Partial<ConfiguracionRecalculo>) {
  return crearApiFalsa({
    obtenerConfiguracion: vi.fn().mockResolvedValue({ ...CONFIGURACION_PRUEBA, ...configuracion }),
  });
}

const recuadro = async () =>
  within(await screen.findByRole('region', { name: 'Estado del clasificador' }));

describe('P-09: recuadro de estado del clasificador (issue #33)', () => {
  it('con Gemini y la clave guardada muestra modelo, umbral, límite y el enlace', async () => {
    renderAdmin(<AdminNuevoRecalculoPage />, { api: con({}) });
    const caja = await recuadro();
    expect(await caja.findByText(/Gemini · modelo gemini-3\.1-flash-lite/)).toBeInTheDocument();
    expect(caja.getByText(/umbral 0,7/)).toBeInTheDocument();
    expect(caja.getByText(/máx\. 50 candidatos \(por defecto\)/)).toBeInTheDocument();
    expect(caja.getByText(/15 llamadas por minuto \(por defecto\)/)).toBeInTheDocument();
    expect(caja.getByText(/clave guardada en la app/)).toBeInTheDocument();
    expect(caja.getByRole('link', { name: 'Configuración del recálculo' })).toHaveAttribute(
      'href',
      '/admin/configuracion',
    );
    // El formulario del recálculo sigue disponible.
    expect(screen.getByRole('button', { name: 'Iniciar recálculo' })).toBeEnabled();
  });

  it('con el clasificador falso lo dice y no pide claves', async () => {
    renderAdmin(<AdminNuevoRecalculoPage />, {
      api: con({ parametros: { ...CONFIGURACION_PRUEBA.parametros, proveedorLlm: 'fake' } }),
    });
    const caja = await recuadro();
    expect(await caja.findByText(/Clasificador falso/)).toBeInTheDocument();
    expect(caja.queryByText(/Clave de Gemini/)).toBeNull();
  });

  it('con Gemini sin clave guardada avisa que se usará el secreto de Supabase', async () => {
    renderAdmin(<AdminNuevoRecalculoPage />, {
      api: con({
        claves: [
          { nombre: 'GEMINI_API_KEY', configurada: false, actualizadaEn: null },
          { nombre: 'OPENALEX_API_KEY', configurada: false, actualizadaEn: null },
        ],
      }),
    });
    const caja = await recuadro();
    expect(await caja.findByText(/GEMINI_API_KEY de los secretos de Supabase/)).toBeInTheDocument();
  });

  it('sin proveedor guardado indica que lo define el secreto LLM_PROVIDER', async () => {
    renderAdmin(<AdminNuevoRecalculoPage />, {
      api: con({ parametros: { ...CONFIGURACION_PRUEBA.parametros, proveedorLlm: null } }),
    });
    const caja = await recuadro();
    expect(await caja.findByText(/LLM_PROVIDER/)).toBeInTheDocument();
  });

  it('si no se puede leer la configuración, lo dice sin bloquear el formulario', async () => {
    renderAdmin(<AdminNuevoRecalculoPage />, {
      api: crearApiFalsa({ obtenerConfiguracion: vi.fn().mockRejectedValue(new Error('x')) }),
    });
    const caja = await recuadro();
    expect(await caja.findByText(/No se pudo leer la configuración/)).toBeInTheDocument();
    expect(caja.getByRole('link', { name: 'Configuración del recálculo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar recálculo' })).toBeEnabled();
  });

  it('con el proveedor compatible con OpenAI muestra modelo, servidor y el estado de la clave', async () => {
    renderAdmin(<AdminNuevoRecalculoPage />, {
      api: con({
        parametros: {
          ...CONFIGURACION_PRUEBA.parametros,
          proveedorLlm: 'openai',
          openaiBaseUrl: 'https://openrouter.ai/api/v1',
          openaiModelo: 'meta-llama/llama-3.3-70b-instruct:free',
        },
        claves: [
          { nombre: 'GEMINI_API_KEY', configurada: false, actualizadaEn: null },
          {
            nombre: 'OPENAI_COMPAT_API_KEY',
            configurada: true,
            actualizadaEn: '2026-11-19T15:00:00Z',
          },
          { nombre: 'OPENALEX_API_KEY', configurada: false, actualizadaEn: null },
        ],
      }),
    });
    const caja = await recuadro();
    expect(
      await caja.findByText(
        /Compatible con OpenAI · meta-llama\/llama-3\.3-70b-instruct:free · openrouter\.ai · umbral 0,7/,
      ),
    ).toBeInTheDocument();
    expect(caja.getByText(/clave guardada en la app/)).toBeInTheDocument();
    expect(caja.queryByText(/Gemini/)).toBeNull();
  });

  it('con el proveedor compatible sin clave guardada avisa que se usará el secreto de Supabase', async () => {
    renderAdmin(<AdminNuevoRecalculoPage />, {
      api: con({
        parametros: {
          ...CONFIGURACION_PRUEBA.parametros,
          proveedorLlm: 'openai',
          openaiBaseUrl: 'https://api.groq.com/openai/v1',
          openaiModelo: 'llama-3.3-70b-versatile',
        },
      }),
    });
    const caja = await recuadro();
    expect(
      await caja.findByText(/OPENAI_COMPAT_API_KEY de los secretos de Supabase/),
    ).toBeInTheDocument();
  });
});
