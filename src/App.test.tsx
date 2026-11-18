import { screen } from '@testing-library/react';
import { App } from './App';
import { crearAuth, crearAuthConSesion, renderConAuth } from './test/auth';

describe('App', () => {
  it('sin sesión, / redirige a la pantalla de ingreso', () => {
    renderConAuth(<App />, { auth: crearAuth(), ruta: '/' });
    expect(screen.getByRole('tab', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('con sesión muestra la pantalla de inicio en /', () => {
    renderConAuth(<App />, { auth: crearAuthConSesion('decisor'), ruta: '/' });
    expect(screen.getByRole('heading', { name: 'GUIOS PRO 2.0' })).toBeInTheDocument();
  });

  it('un decisor que entra a /admin/sugerida es redirigido al inicio', () => {
    renderConAuth(<App />, { auth: crearAuthConSesion('decisor'), ruta: '/admin/sugerida' });
    expect(screen.getByRole('heading', { name: 'GUIOS PRO 2.0' })).toBeInTheDocument();
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
});
