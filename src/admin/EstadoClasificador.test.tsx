import { screen, within } from '@testing-library/react';
import { CONFIGURACION_PRUEBA, crearApiFalsa, renderAdmin } from './pruebas';
import { EstadoClasificador } from './EstadoClasificador';

const VACIOS = {
  proveedorLlm: 'gemini',
  modelo: null,
  umbral: null,
  maxCandidatos: null,
  llamadasPorMinuto: null,
  crossrefMailto: null,
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
        'Gemini · modelo gemini-3.1-flash-lite (por defecto) · umbral 0,7 (por defecto) · máx. 50 candidatos (por defecto) · 15 llamadas por minuto (por defecto) · clave guardada en la app',
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
    expect(caja.getByText(/elige Gemini o Falso/)).toBeVisible();
  });
});
