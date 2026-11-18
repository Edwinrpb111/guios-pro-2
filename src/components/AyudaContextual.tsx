import { useId, useState } from 'react';

export interface AyudaContextualProps {
  /** Nombre accesible del botón (p. ej. «Ayuda sobre la importancia sugerida»). */
  etiqueta: string;
  /** Texto explicativo; se muestra al pasar el cursor o enfocar y se anuncia como descripción. */
  texto: string;
}

/** Signo «?» con ayuda emergente accesible por teclado (Escape la cierra). */
export function AyudaContextual({ etiqueta, texto }: AyudaContextualProps) {
  const id = useId();
  const [cerrada, setCerrada] = useState(false);
  return (
    <span
      className="ayuda-contextual"
      onMouseEnter={() => setCerrada(false)}
      onFocus={() => setCerrada(false)}
    >
      <button
        type="button"
        className="ayuda-contextual__boton"
        aria-label={etiqueta}
        aria-describedby={id}
        data-cerrada={cerrada}
        onKeyDown={(evento) => {
          if (evento.key === 'Escape') setCerrada(true);
        }}
      >
        ?
      </button>
      <span role="tooltip" id={id} className="ayuda-contextual__texto">
        {texto}
      </span>
    </span>
  );
}
