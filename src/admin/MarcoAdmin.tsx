import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AyudaMetodo } from '../pages/AyudaMetodo';
import '../styles/admin.css';

export interface MarcoAdminProps {
  titulo: string;
  descripcion?: string;
  /** Botones o enlaces junto al título. */
  acciones?: ReactNode;
  children: ReactNode;
}

/** Estructura común de las pantallas de administración (P-08 y P-09). */
export function MarcoAdmin({ titulo, descripcion, acciones, children }: MarcoAdminProps) {
  return (
    <main className="pagina admin">
      <nav className="admin__migas" aria-label="Ruta de navegación">
        <Link to="/">Inicio</Link>
        <span aria-hidden="true"> / </span>
        <span>Administración</span>
      </nav>
      <header className="admin__cabecera">
        <div>
          <h1>{titulo}</h1>
          {descripcion && <p className="admin__descripcion">{descripcion}</p>}
        </div>
        <div className="admin__acciones">
          {acciones}
          <AyudaMetodo />
        </div>
      </header>
      {children}
    </main>
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
