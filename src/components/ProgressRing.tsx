export interface ProgressRingProps {
  completados: number;
  total: number;
  /** Nombre accesible; por defecto «Progreso». */
  etiqueta?: string;
}

const RADIO = 14;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

/** Anillo de avance «completados/total», expuesto como progressbar (valor en %). */
export function ProgressRing({ completados, total, etiqueta = 'Progreso' }: ProgressRingProps) {
  const proporcion = total > 0 ? Math.min(Math.max(completados / total, 0), 1) : 0;
  const porcentaje = Math.round(proporcion * 100);
  return (
    <svg
      className="anillo"
      viewBox="0 0 34 34"
      role="progressbar"
      aria-label={etiqueta}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={porcentaje}
      aria-valuetext={`${completados} de ${total} (${porcentaje} %)`}
      data-completo={total > 0 && proporcion === 1}
    >
      <circle className="anillo__pista" cx="17" cy="17" r={RADIO} />
      <circle
        className="anillo__avance"
        cx="17"
        cy="17"
        r={RADIO}
        strokeDasharray={`${CIRCUNFERENCIA * proporcion} ${CIRCUNFERENCIA}`}
        transform="rotate(-90 17 17)"
      />
      <text className="anillo__texto" x="17" y="21">
        {completados}/{total}
      </text>
    </svg>
  );
}
