import type { ReactNode } from 'react';

export interface UsuarioLayout {
  nombre: string;
  iniciales: string;
  /** Línea secundaria (p. ej. «Decisor · UNEMI»). */
  detalle?: string;
}

export interface LayoutProps {
  usuario?: UsuarioLayout;
  /** Enlaces de la navegación lateral (escritorio). */
  navegacion: ReactNode;
  /** Enlaces de la barra de navegación inferior (móvil, ≤ 760 px). */
  navegacionMovil?: ReactNode;
  /** Botones de la cabecera (p. ej. ayuda del método, cerrar sesión). */
  accionesCabecera?: ReactNode;
  /** Barra de acciones del paso (p. ej. `BottomBar`). */
  barraInferior?: ReactNode;
  subtituloMarca?: string;
  children: ReactNode;
}

/** Estructura de página: cabecera, navegación lateral/móvil, contenido y barra inferior. */
export function Layout({
  usuario,
  navegacion,
  navegacionMovil,
  accionesCabecera,
  barraInferior,
  subtituloMarca = 'Evaluación de adopción de software libre',
  children,
}: LayoutProps) {
  return (
    <div className="layout">
      <a className="layout__salto" href="#contenido-principal">
        Saltar al contenido
      </a>
      <header className="layout__cabecera">
        <div className="layout__marca">
          <span className="layout__logo" aria-hidden="true">
            G
          </span>
          <span>
            GUIOS PRO <span className="layout__version">2.0</span>
          </span>
          <span className="layout__subtitulo">{subtituloMarca}</span>
        </div>
        <span className="layout__espacio" />
        {accionesCabecera && <div className="layout__acciones">{accionesCabecera}</div>}
        {usuario && (
          <div className="layout__usuario">
            <span className="layout__avatar" aria-hidden="true">
              {usuario.iniciales}
            </span>
            <span className="layout__quien">
              <b>{usuario.nombre}</b>
              {usuario.detalle && <span>{usuario.detalle}</span>}
            </span>
          </div>
        )}
      </header>
      <nav className="layout__lateral" aria-label="Principal">
        {navegacion}
      </nav>
      <main id="contenido-principal" className="layout__principal">
        {children}
      </main>
      {barraInferior}
      {navegacionMovil && (
        <nav className="layout__nav-movil" aria-label="Principal (móvil)">
          {navegacionMovil}
        </nav>
      )}
    </div>
  );
}
