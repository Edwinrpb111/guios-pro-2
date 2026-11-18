import { Navigate, Outlet } from 'react-router';
import { Cargando } from './Cargando';
import { useAuth } from './useAuth';

/** Solo administradores; cualquier otro usuario vuelve a / sin ver la página. */
export function RutaAdmin() {
  const { rol, cargando } = useAuth();
  if (cargando) return <Cargando />;
  if (rol !== 'administrador') return <Navigate to="/" replace />;
  return <Outlet />;
}
