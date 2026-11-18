import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface VentanaModalProps {
  abierta: boolean;
  /** Título visible; también es el nombre accesible del diálogo. */
  titulo: string;
  /** Se invoca con Escape, con el botón «Cerrar» y con un clic en el fondo. */
  onCerrar: () => void;
  children?: ReactNode;
}

const ENFOCABLES =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal accesible: foco atrapado, Escape y clic en el fondo cierran, devuelve el foco
 * a quien lo abrió y oculta el resto de la página a los lectores de pantalla mientras está abierto.
 */
export function VentanaModal({ abierta, titulo, onCerrar, children }: VentanaModalProps) {
  const idTitulo = useId();
  const dialogo = useRef<HTMLDivElement>(null);
  const botonCerrar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierta) return;
    const quienAbrio =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Todo lo que cuelga de <body> salvo el propio diálogo deja de existir para los lectores de pantalla.
    const ocultos = Array.from(document.body.children).filter(
      (nodo) =>
        nodo !== dialogo.current?.parentElement && nodo.getAttribute('aria-hidden') !== 'true',
    );
    ocultos.forEach((nodo) => nodo.setAttribute('aria-hidden', 'true'));
    botonCerrar.current?.focus();
    return () => {
      ocultos.forEach((nodo) => nodo.removeAttribute('aria-hidden'));
      quienAbrio?.focus();
    };
  }, [abierta]);

  if (!abierta) return null;

  function alPulsar(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === 'Escape') {
      evento.stopPropagation();
      onCerrar();
      return;
    }
    if (evento.key !== 'Tab' || !dialogo.current) return;
    const enfocables = Array.from(dialogo.current.querySelectorAll<HTMLElement>(ENFOCABLES));
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (!primero || !ultimo) return;
    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  return createPortal(
    <div className="modal__fondo" data-testid="fondo-modal" onClick={onCerrar}>
      <div
        ref={dialogo}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onClick={(evento) => evento.stopPropagation()}
        onKeyDown={alPulsar}
      >
        <header className="modal__cabecera">
          <h2 id={idTitulo}>{titulo}</h2>
          <button
            ref={botonCerrar}
            type="button"
            className="boton boton--fantasma"
            onClick={onCerrar}
          >
            Cerrar
          </button>
        </header>
        <div className="modal__cuerpo">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
