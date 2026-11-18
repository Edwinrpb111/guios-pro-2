import { Link } from 'react-router';
import { useAuth } from '../auth/useAuth';

export function InicioPage() {
  const { usuario, rol, cerrarSesion } = useAuth();
  return (
    <main className="pagina">
      <h1>GUIOS PRO 2.0</h1>
      <p>Evaluación de la adopción de software libre en organizaciones.</p>
      <p>
        Sesión iniciada como {usuario?.email}
        {rol === 'administrador' ? ' (administrador)' : ''}.
      </p>
      {rol === 'administrador' && <Link to="/admin/sugerida">Importancia sugerida</Link>}
      <p>
        <button type="button" onClick={() => void cerrarSesion()}>
          Cerrar sesión
        </button>
      </p>
    </main>
  );
}
