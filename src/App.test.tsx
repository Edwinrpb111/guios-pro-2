import { screen } from '@testing-library/react';
import { App } from './App';
import { repositorio } from './datos';
import { crearAuth, crearAuthConSesion, renderConAuth } from './test/auth';
import { restablecerRepositorioFalso } from './test/datos';

vi.mock('./datos', async () => ({
  repositorio: (await import('./test/datos')).crearRepositorioFalso(),
}));

describe('App', () => {
  beforeEach(() => restablecerRepositorioFalso(repositorio));

  it('sin sesión, / redirige a la pantalla de ingreso', () => {
    renderConAuth(<App />, { auth: crearAuth(), ruta: '/' });
    expect(screen.getByRole('tab', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('con sesión muestra la pantalla de inicio en /', async () => {
    renderConAuth(<App />, { auth: crearAuthConSesion('decisor'), ruta: '/' });
    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
  });

  it('un decisor que entra a /admin/sugerida es redirigido al inicio', async () => {
    renderConAuth(<App />, { auth: crearAuthConSesion('decisor'), ruta: '/admin/sugerida' });
    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Importancia sugerida' })).not.toBeInTheDocument();
  });

  it('un administrador ve /admin/sugerida', () => {
    renderConAuth(<App />, { auth: crearAuthConSesion('administrador'), ruta: '/admin/sugerida' });
    expect(screen.getByRole('heading', { name: 'Importancia sugerida' })).toBeInTheDocument();
  });

  it('muestra la página no encontrada en una ruta desconocida (con sesión)', () => {
    renderConAuth(<App />, { auth: crearAuthConSesion('decisor'), ruta: '/no-existe' });
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });

  it('con sesión abre los subfactores de una evaluación en /evaluaciones/:id/subfactores', async () => {
    renderConAuth(<App />, {
      auth: crearAuthConSesion('decisor'),
      ruta: '/evaluaciones/7/subfactores',
    });
    expect(await screen.findByText(/Ningún factor es relevante/)).toBeInTheDocument();
  });

  it('con sesión abre los resultados de una evaluación en /evaluaciones/:id/resultados', async () => {
    renderConAuth(<App />, {
      auth: crearAuthConSesion('decisor'),
      ruta: '/evaluaciones/7/resultados',
    });
    expect(await screen.findByRole('heading', { name: 'Sin recomendación' })).toBeInTheDocument();
  });

  it('con sesión abre el informe imprimible en /evaluaciones/:id/informe', async () => {
    renderConAuth(<App />, {
      auth: crearAuthConSesion('decisor'),
      ruta: '/evaluaciones/7/informe',
    });
    expect(
      await screen.findByRole('article', { name: 'Informe de evaluación' }),
    ).toBeInTheDocument();
  });
});
