import type { ReactNode } from 'react';

export interface BottomBarProps {
  onAtras?: () => void;
  atrasDeshabilitado?: boolean;
  /** Acción secundaria (p. ej. «Guardar borrador»); se muestra si hay etiqueta y evento. */
  etiquetaSecundaria?: string;
  onSecundaria?: () => void;
  secundariaDeshabilitada?: boolean;
  /** Acción principal (p. ej. «Siguiente»); se muestra si hay etiqueta. */
  etiquetaPrincipal?: string;
  onPrincipal?: () => void;
  principalDeshabilitado?: boolean;
  /** Acciones adicionales (p. ej. exportar), entre «Atrás» y las acciones del paso. */
  children?: ReactNode;
}

/** Barra inferior de acciones del paso: solo props y eventos, sin lógica del método. */
export function BottomBar({
  onAtras,
  atrasDeshabilitado = false,
  etiquetaSecundaria,
  onSecundaria,
  secundariaDeshabilitada = false,
  etiquetaPrincipal,
  onPrincipal,
  principalDeshabilitado = false,
  children,
}: BottomBarProps) {
  return (
    <section className="barra-inferior" aria-label="Acciones del paso">
      {onAtras && (
        <button
          type="button"
          className="boton boton--fantasma"
          onClick={onAtras}
          disabled={atrasDeshabilitado}
        >
          <span aria-hidden="true">← </span>Atrás
        </button>
      )}
      <span className="barra-inferior__espacio" />
      {children}
      {etiquetaSecundaria && onSecundaria && (
        <button
          type="button"
          className="boton barra-inferior__ocultar-movil"
          onClick={onSecundaria}
          disabled={secundariaDeshabilitada}
        >
          {etiquetaSecundaria}
        </button>
      )}
      {etiquetaPrincipal && (
        <button
          type="button"
          className="boton boton--primario"
          onClick={onPrincipal}
          disabled={principalDeshabilitado}
        >
          {etiquetaPrincipal}
          <span aria-hidden="true"> →</span>
        </button>
      )}
    </section>
  );
}
