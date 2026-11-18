import { useId, useRef, type KeyboardEvent } from 'react';

export interface OpcionSelector<V extends string | number> {
  valor: V;
  /** Texto visible: el color nunca va solo (BRIEF §12.2). */
  etiqueta: string;
  /** Texto de ayuda opcional: tooltip nativo y descripción accesible. */
  ayuda?: string;
}

export interface SegmentedSelectorProps<V extends string | number> {
  /** Nombre accesible del grupo (p. ej. «Importancia del factor Soporte»). */
  etiqueta: string;
  opciones: readonly OpcionSelector<V>[];
  /** Valor seleccionado (componente controlado); `null` si aún no hay selección. */
  valor: V | null;
  onCambiar: (valor: V) => void;
  deshabilitado?: boolean;
  /** Paleta de la opción seleccionada: escala de importancia, de cumplimiento o neutra. */
  variante?: 'neutra' | 'importancia' | 'cumplimiento';
}

/**
 * Selector de una opción en un solo clic (BRIEF §12.2). Semántica radiogroup con foco
 * itinerante: Tab entra en la opción seleccionada; flechas, Inicio y Fin mueven y
 * seleccionan; Enter y Espacio activan la opción enfocada.
 */
export function SegmentedSelector<V extends string | number>({
  etiqueta,
  opciones,
  valor,
  onCambiar,
  deshabilitado = false,
  variante = 'neutra',
}: SegmentedSelectorProps<V>) {
  const idBase = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const indiceSeleccionado = opciones.findIndex((o) => o.valor === valor);
  const paradaTab = indiceSeleccionado >= 0 ? indiceSeleccionado : 0;

  const elegir = (indice: number) => {
    const opcion = opciones[indice];
    if (opcion && opcion.valor !== valor) onCambiar(opcion.valor);
  };

  const manejarTecla = (evento: KeyboardEvent<HTMLButtonElement>, indice: number) => {
    if (deshabilitado) return;
    const total = opciones.length;
    let destino: number;
    switch (evento.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        destino = (indice + 1) % total;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        destino = (indice - 1 + total) % total;
        break;
      case 'Home':
        destino = 0;
        break;
      case 'End':
        destino = total - 1;
        break;
      default:
        return;
    }
    evento.preventDefault();
    refs.current[destino]?.focus();
    elegir(destino);
  };

  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      aria-disabled={deshabilitado || undefined}
      className={`selector selector--${variante}`}
    >
      {opciones.map((opcion, indice) => {
        const idAyuda = `${idBase}-ayuda-${indice}`;
        return (
          <button
            key={String(opcion.valor)}
            ref={(el) => {
              refs.current[indice] = el;
            }}
            type="button"
            role="radio"
            aria-checked={opcion.valor === valor}
            aria-describedby={opcion.ayuda ? idAyuda : undefined}
            tabIndex={indice === paradaTab ? 0 : -1}
            disabled={deshabilitado}
            title={opcion.ayuda}
            data-valor={opcion.valor}
            className="selector__opcion"
            onClick={() => elegir(indice)}
            onKeyDown={(evento) => manejarTecla(evento, indice)}
          >
            {opcion.etiqueta}
          </button>
        );
      })}
      {/* Descripciones fuera de los botones: así no pasan a formar parte de su nombre accesible. */}
      <span className="solo-lectores">
        {opciones.map(
          (opcion, indice) =>
            opcion.ayuda && (
              <span key={String(opcion.valor)} id={`${idBase}-ayuda-${indice}`}>
                {opcion.ayuda}
              </span>
            ),
        )}
      </span>
    </div>
  );
}
