import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { repositorio } from '../datos';
import { crearAuthConSesion, renderConAuth } from '../test/auth';
import { restablecerRepositorioFalso } from '../test/datos';

// Las pantallas del decisor (destino de la redirección) usan el repositorio de datos.
vi.mock('../datos', async () => ({
  repositorio: (await import('../test/datos')).crearRepositorioFalso(),
}));

describe('App: rutas de administración de la IS (issue #11)', () => {
  beforeEach(() => restablecerRepositorioFalso(repositorio));

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

const lateral = () => within(screen.getByRole('navigation', { name: 'Principal' }));
const movil = () => within(screen.getByRole('navigation', { name: 'Principal (móvil)' }));

describe('App: P-08..P-10 dentro del marco común (issue #31)', () => {
  beforeEach(() => restablecerRepositorioFalso(repositorio));

  it.each([
    ['P-08', '/admin/sugerida', 'Importancia sugerida'],
    ['P-09 (nuevo)', '/admin/sugerida/nuevo', 'Nuevo recálculo'],
    ['P-09 (progreso)', '/admin/sugerida/abc', 'Recálculo'],
    ['P-10', '/admin/sugerida?detalle=1', 'Importancia sugerida'],
  ])('%s (%s) usa la barra lateral con «Importancia sugerida» activa', (_p, ruta, titulo) => {
    renderConAuth(<App />, { auth: crearAuthConSesion('administrador'), ruta });
    expect(screen.getByRole('heading', { level: 1, name: titulo })).toBeInTheDocument();

    // Mismas secciones que Inicio y la evaluación.
    expect(lateral().getByText('Decisor')).toBeInTheDocument();
    expect(lateral().getByText('Administración')).toBeInTheDocument();
    expect(lateral().getByText('Cuenta')).toBeInTheDocument();
    expect(lateral().getByRole('button', { name: /Nueva evaluación/ })).toBeEnabled();
    expect(lateral().getByRole('button', { name: /Cerrar sesión/ })).toBeInTheDocument();

    // El ítem activo es el de administración, no el inicio.
    expect(lateral().getByRole('link', { name: /Importancia sugerida/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(lateral().getByRole('link', { name: /Inicio e historial/ })).not.toHaveAttribute(
      'aria-current',
    );
    expect(movil().getByRole('link', { name: /IA/ })).toHaveAttribute('aria-current', 'page');

    // Un solo contenido principal y una sola ayuda del método (la de la cabecera).
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Ayuda del método' })).toHaveLength(1);
  });

  it('en P-08 la cabecera del marco abre la ayuda del método (P-11)', async () => {
    renderConAuth(<App />, { auth: crearAuthConSesion('administrador'), ruta: '/admin/sugerida' });
    await userEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Ayuda del método' }),
    );
    expect(screen.getByRole('dialog', { name: 'Ayuda del método GUIOS' })).toBeVisible();
  });

  it('un decisor que abre P-10 (/admin/sugerida?detalle=1) vuelve al inicio sin el panel', async () => {
    renderConAuth(<App />, {
      auth: crearAuthConSesion('decisor'),
      ruta: '/admin/sugerida?detalle=1',
    });
    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(lateral().queryByRole('link', { name: /Importancia sugerida/ })).toBeNull();
  });
});
