import { screen } from '@testing-library/react';
import { App } from '../App';
import { crearAuthConSesion, renderConAuth } from '../test/auth';

describe('App: rutas de administración de la IS (issue #11)', () => {
  it('un administrador llega a P-09 (/admin/sugerida/nuevo)', () => {
    renderConAuth(<App />, {
      auth: crearAuthConSesion('administrador'),
      ruta: '/admin/sugerida/nuevo',
    });
    expect(screen.getByRole('heading', { name: 'Nuevo recálculo' })).toBeInTheDocument();
  });

  it('un decisor que entra a P-09 es redirigido y no ve el formulario', () => {
    renderConAuth(<App />, { auth: crearAuthConSesion('decisor'), ruta: '/admin/sugerida/nuevo' });
    expect(screen.queryByRole('heading', { name: 'Nuevo recálculo' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar recálculo' })).not.toBeInTheDocument();
  });

  it('un decisor tampoco ve el progreso de un recálculo (/admin/sugerida/:id)', () => {
    renderConAuth(<App />, { auth: crearAuthConSesion('decisor'), ruta: '/admin/sugerida/5' });
    expect(screen.queryByText(/factores procesados/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recálculo' })).not.toBeInTheDocument();
  });
});
