import { Navigate, Outlet, useLocation } from 'react-router';
import { Cargando } from './Cargando';
import { useAuth } from './useAuth';

/** Exige sesión; si no hay, lleva a /login recordando la ruta pedida. */
export function RutaProtegida() {
  const { sesion, cargando } = useAuth();
  const ubicacion = useLocation();
  if (cargando) return <Cargando />;
  if (!sesion) {
    const desde = ubicacion.pathname + ubicacion.search + ubicacion.hash;
    return <Navigate to="/login" replace state={{ desde }} />;
  }
  return <Outlet />;
}
