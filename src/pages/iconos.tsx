/** Iconos de la navegación (trazos del prototipo del CP1); decorativos, el texto va al lado. */
const propiedades = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  'aria-hidden': true,
  focusable: false,
} as const;

export const IconoInicio = () => (
  <svg {...propiedades}>
    <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </svg>
);

export const IconoNueva = () => (
  <svg {...propiedades}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

export const IconoIA = () => (
  <svg {...propiedades}>
    <path d="M12 3l2.2 5.1L19 10l-4.8 1.9L12 17l-2.2-5.1L5 10l4.8-1.9z" />
    <path d="M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z" />
  </svg>
);

export const IconoSalir = () => (
  <svg {...propiedades}>
    <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H4" />
  </svg>
);
