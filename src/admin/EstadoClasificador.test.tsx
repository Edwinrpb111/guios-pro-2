import { screen, within } from '@testing-library/react';
import { CONFIGURACION_PRUEBA, crearApiFalsa, renderAdmin } from './pruebas';
import { EstadoClasificador } from './EstadoClasificador';

const VACIOS = {
  proveedorLlm: 'gemini',
  modelo: null,
  umbral: null,
  maxCandidatos: null,
  llamadasPorMinuto: null,
  llamadasSimultaneas: null,
  desactivarRazonamiento: null,
  crossrefMailto: null,
  openaiBaseUrl: null,
  openaiModelo: null,
} as const;

describe('EstadoClasificador (P-09, issue #37)', () => {
  it('con los campos vacíos muestra el valor por defecto efectivo y una nota, no «secretos de Supabase»', async () => {
    renderAdmin(<EstadoClasificador />, {
      api: crearApiFalsa({
        obtenerConfiguracion: vi
          .fn()
          .mockResolvedValue({ ...CONFIGURACION_PRUEBA, parametros: VACIOS }),
      }),
    });
    const caja = within(await screen.findByRole('region', { name: 'Estado del clasificador' }));
    expect(
      await caja.findByText(
        'Gemini · modelo gemini-3.1-flash-lite (por defecto) · umbral 0,7 (por defecto) · máx. 50 candidatos (por defecto) · 15 llamadas por minuto (por defecto) · 5 llamadas simultáneas (por defecto) · clave guardada en la app',
      ),
    ).toBeInTheDocument();
    expect(caja.getByText(/Un valor «por defecto» puede cambiarse con un secreto/)).toBeVisible();
    expect(caja.queryByText(/modelo de los secretos/)).toBeNull();
    expect(caja.queryByText(/umbral: secretos/)).toBeNull();
  });

  it('con el proveedor sin fijar lo dice y recomienda elegir Gemini o Falso', async () => {
    renderAdmin(<EstadoClasificador />, {
      api: crearApiFalsa({
        obtenerConfiguracion: vi.fn().mockResolvedValue({
          ...CONFIGURACION_PRUEBA,
          parametros: { ...VACIOS, proveedorLlm: null },
        }),
      }),
    });
    const caja = within(await screen.findByRole('region', { name: 'Estado del clasificador' }));
    expect(await caja.findByText(/lo decide el secreto LLM_PROVIDER de Supabase/)).toBeVisible();
    expect(caja.getByText(/elige Gemini, Compatible con OpenAI o Falso/)).toBeVisible();
  });

  it('con el proveedor compatible con OpenAI muestra «Compatible con OpenAI · modelo · servidor»', async () => {
    renderAdmin(<EstadoClasificador />, {
      api: crearApiFalsa({
        obtenerConfiguracion: vi.fn().mockResolvedValue({
          ...CONFIGURACION_PRUEBA,
          parametros: {
            ...VACIOS,
            proveedorLlm: 'openai',
            openaiBaseUrl: 'https://api.deepseek.com',
            openaiModelo: 'deepseek-chat',
          },
          claves: [
            {
              nombre: 'OPENAI_COMPAT_API_KEY',
              configurada: true,
              actualizadaEn: '2026-11-19T15:00:00Z',
            },
          ],
        }),
      }),
    });
    const caja = within(await screen.findByRole('region', { name: 'Estado del clasificador' }));
    expect(
      await caja.findByText(
        'Compatible con OpenAI · deepseek-chat · api.deepseek.com · umbral 0,7 (por defecto) · máx. 50 candidatos (por defecto) · 15 llamadas por minuto (por defecto) · 5 llamadas simultáneas (por defecto) · clave guardada en la app',
      ),
    ).toBeInTheDocument();
    expect(caja.getByText(/Un valor «por defecto» puede cambiarse con un secreto/)).toBeVisible();
  });

  it('una dirección guardada que no se puede leer no rompe el recuadro', async () => {
    renderAdmin(<EstadoClasificador />, {
      api: crearApiFalsa({
        obtenerConfiguracion: vi.fn().mockResolvedValue({
          ...CONFIGURACION_PRUEBA,
          parametros: {
            ...VACIOS,
            proveedorLlm: 'openai',
            openaiBaseUrl: 'no es una url',
            openaiModelo: 'm',
          },
        }),
      }),
    });
    const caja = within(await screen.findByRole('region', { name: 'Estado del clasificador' }));
    expect(await caja.findByText(/Compatible con OpenAI · m · no es una url/)).toBeVisible();
  });
});
