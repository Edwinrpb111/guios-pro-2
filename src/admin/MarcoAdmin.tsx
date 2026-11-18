import type { ReactNode } from 'react';
import { Link } from 'react-router';
import '../styles/admin.css';

export interface MarcoAdminProps {
  titulo: string;
  descripcion?: string;
  /** Botones o enlaces junto al título. */
  acciones?: ReactNode;
  children: ReactNode;
}

/**
 * Migas, título y acciones de las pantallas de administración (P-08 y P-09). Solo dibuja el
 * contenido: la cabecera, la barra lateral y la ayuda del método las pone el marco común
 * (`MarcoDeRuta` en App), igual que en Inicio y la evaluación (issue #31).
 */
export function MarcoAdmin({ titulo, descripcion, acciones, children }: MarcoAdminProps) {
  return (
    <div className="admin">
      <nav className="migas" aria-label="Ruta de navegación">
        <Link to="/">Inicio</Link> › Administración
      </nav>
      <div className="admin__cabecera">
        <div>
          <h1>{titulo}</h1>
          {descripcion && <p className="admin__descripcion">{descripcion}</p>}
        </div>
        {acciones && <div className="admin__acciones">{acciones}</div>}
      </div>
      {children}
    </div>
  );
}

/** Aviso con rol `alert` (errores) o `status` (información). */
export function Aviso({
  tipo = 'info',
  children,
}: {
  tipo?: 'info' | 'error' | 'exito';
  children: ReactNode;
}) {
  return (
    <div
      className={`admin-aviso admin-aviso--${tipo}`}
      role={tipo === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}
