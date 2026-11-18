import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { crearAuthConSesion, renderConAuth } from '../test/auth';
import { InicioPage } from './InicioPage';

describe('InicioPage', () => {
  it('muestra el título y el correo del usuario', () => {
    renderConAuth(<InicioPage />, { auth: crearAuthConSesion('decisor') });
    expect(screen.getByRole('heading', { name: 'GUIOS PRO 2.0' })).toBeInTheDocument();
    expect(screen.getByText(/ana@example\.com/)).toBeInTheDocument();
  });

  it('cerrar sesión llama a cerrarSesion', async () => {
    const { auth } = renderConAuth(<InicioPage />, { auth: crearAuthConSesion('decisor') });
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(auth.cerrarSesion).toHaveBeenCalledTimes(1);
  });

  it('solo el administrador ve el enlace a la importancia sugerida', () => {
    const { unmount } = renderConAuth(<InicioPage />, { auth: crearAuthConSesion('decisor') });
    expect(screen.queryByRole('link', { name: 'Importancia sugerida' })).not.toBeInTheDocument();
    unmount();
    renderConAuth(<InicioPage />, { auth: crearAuthConSesion('administrador') });
    expect(screen.getByRole('link', { name: 'Importancia sugerida' })).toHaveAttribute(
      'href',
      '/admin/sugerida',
    );
  });
});
