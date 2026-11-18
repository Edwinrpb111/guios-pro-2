import { screen } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router';
import { crearAuth, crearAuthConSesion, renderConAuth } from '../test/auth';
import { RutaAdmin } from './RutaAdmin';
import { RutaProtegida } from './RutaProtegida';

function Destino() {
  const ubicacion = useLocation();
  const desde = (ubicacion.state as { desde?: string } | null)?.desde ?? 'sin-destino';
  return <p>Pantalla de ingreso, destino: {desde}</p>;
}

function Rutas() {
  return (
    <Routes>
      <Route path="/login" element={<Destino />} />
      <Route element={<RutaProtegida />}>
        <Route path="/" element={<p>Contenido protegido</p>} />
        <Route element={<RutaAdmin />}>
          <Route path="/admin/sugerida" element={<p>Contenido de administración</p>} />
        </Route>
      </Route>
    </Routes>
  );
}

describe('RutaProtegida', () => {
  it('sin sesión redirige a /login conservando la ruta pedida', () => {
    renderConAuth(<Rutas />, { auth: crearAuth(), ruta: '/admin/sugerida?x=1' });
    expect(
      screen.getByText('Pantalla de ingreso, destino: /admin/sugerida?x=1'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Contenido de administración')).not.toBeInTheDocument();
  });

  it('mientras carga no muestra contenido protegido ni redirige', () => {
    renderConAuth(<Rutas />, { auth: crearAuth({ cargando: true }), ruta: '/' });
    expect(screen.getByRole('status')).toHaveTextContent('Cargando');
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument();
    expect(screen.queryByText(/Pantalla de ingreso/)).not.toBeInTheDocument();
  });

  it('con sesión muestra el contenido', () => {
    renderConAuth(<Rutas />, { auth: crearAuthConSesion('decisor'), ruta: '/' });
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
  });
});

describe('RutaAdmin', () => {
  it('un decisor que entra a /admin/sugerida es redirigido a / sin ver nada de la página', () => {
    renderConAuth(<Rutas />, { auth: crearAuthConSesion('decisor'), ruta: '/admin/sugerida' });
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
    expect(screen.queryByText('Contenido de administración')).not.toBeInTheDocument();
  });

  it('un administrador ve la página de administración', () => {
    renderConAuth(<Rutas />, {
      auth: crearAuthConSesion('administrador'),
      ruta: '/admin/sugerida',
    });
    expect(screen.getByText('Contenido de administración')).toBeInTheDocument();
  });

  it('sin rol conocido (perfil ilegible) se trata como no administrador', () => {
    const auth = crearAuthConSesion('decisor', { rol: null });
    renderConAuth(<Rutas />, { auth, ruta: '/admin/sugerida' });
    expect(screen.queryByText('Contenido de administración')).not.toBeInTheDocument();
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
  });

  it('mientras carga el rol no muestra contenido de administración', () => {
    const auth = crearAuthConSesion('administrador', { cargando: true });
    renderConAuth(<Rutas />, { auth, ruta: '/admin/sugerida' });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Contenido de administración')).not.toBeInTheDocument();
  });
});
