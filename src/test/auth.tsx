import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, type InitialEntry } from 'react-router';
import { ContextoAuth, type ValorAuth } from '../auth/contexto';

/** Valor de autenticación para pruebas: sin sesión, con las acciones simuladas. */
export function crearAuth(parcial: Partial<ValorAuth> = {}): ValorAuth {
  return {
    sesion: null,
    usuario: null,
    rol: null,
    cargando: false,
    iniciarSesion: vi.fn().mockResolvedValue({ error: null }),
    registrar: vi.fn().mockResolvedValue({ error: null, requiereConfirmacion: false }),
    cerrarSesion: vi.fn().mockResolvedValue(undefined),
    ...parcial,
  };
}

/** Auth de prueba con una sesión activa y el rol indicado. */
export function crearAuthConSesion(
  rol: 'decisor' | 'administrador',
  parcial: Partial<ValorAuth> = {},
): ValorAuth {
  const usuario = {
    id: 'u-1',
    email: 'ana@example.com',
    user_metadata: { nombre_completo: 'Ana Pérez' },
  } as unknown as ValorAuth['usuario'];
  return crearAuth({ sesion: { user: usuario } as ValorAuth['sesion'], usuario, rol, ...parcial });
}

/**
 * Renderiza `ui` dentro de un router en memoria, con el contexto de auth simulado y un
 * cliente de consultas nuevo (sin reintentos, para que los errores se vean al instante).
 */
export function renderConAuth(
  ui: ReactElement,
  opciones: { auth?: ValorAuth; ruta?: InitialEntry } = {},
) {
  const auth = opciones.auth ?? crearAuth();
  const consultas = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return {
    auth,
    ...render(
      <QueryClientProvider client={consultas}>
        <ContextoAuth.Provider value={auth}>
          <MemoryRouter initialEntries={[opciones.ruta ?? '/']}>{ui}</MemoryRouter>
        </ContextoAuth.Provider>
      </QueryClientProvider>,
    ),
  };
}
