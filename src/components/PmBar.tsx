import type { Foda } from '../guios-core/escalas';
import { FodaChip } from './FodaChip';
import { formatearCota, formatearPm } from './formato';

export interface PmBarProps {
  /** Ponderación media (1..4) o `null` si aún no hay datos. */
  valor: number | null;
  /** Umbral de clasificación; por defecto 3. */
  umbral?: number;
  /** Indica que el valor se calcula con subfactores aún incompletos. */
  parcial?: boolean;
  /** Clasificación FODA a mostrar en texto junto a la barra (y como color). */
  foda?: Foda | null;
  /** `detalle`: valor grande con escala (cabecera de factor); `compacta`: fila de gráfico. */
  variante?: 'detalle' | 'compacta';
  /** Nombre del factor (variante compacta). */
  nombre?: string;
}

const MIN = 1;
const MAX = 4;
const aPorcentaje = (n: number) => ((n - MIN) / (MAX - MIN)) * 100;

/** Barra de ponderación media con marca del umbral. Valor con dos decimales y coma. */
export function PmBar({
  valor,
  umbral = 3,
  parcial = false,
  foda,
  variante = 'detalle',
  nombre,
}: PmBarProps) {
  const compacta = variante === 'compacta';
  const etiqueta = compacta ? (nombre ?? 'Ponderación media') : 'Ponderación media';
  const estado = valor == null ? 'sin-dato' : valor >= umbral ? 'alto' : 'bajo';
  const textoValor =
    valor == null
      ? 'sin valor'
      : `${formatearPm(valor)} de 4,00, ${
          estado === 'alto' ? 'en o sobre el umbral' : 'bajo el umbral'
        } ${formatearCota(umbral)}${foda ? `, ${foda}` : ''}`;

  const medidor = (
    <div
      className="pm-barra__medidor"
      role="meter"
      aria-label={etiqueta}
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={valor ?? undefined}
      aria-valuetext={textoValor}
    >
      <div
        className="pm-barra__relleno"
        data-testid="pm-relleno"
        style={{ width: `${valor == null ? 0 : aPorcentaje(valor)}%` }}
      />
      <div
        className="pm-barra__umbral"
        data-testid="pm-umbral"
        style={{ left: `${aPorcentaje(umbral)}%` }}
      />
    </div>
  );

  if (compacta) {
    return (
      <div
        className="pm-barra pm-barra--compacta"
        data-estado={estado}
        data-foda={foda ?? undefined}
      >
        <span className="pm-barra__etiqueta" title={etiqueta}>
          {etiqueta}
        </span>
        {medidor}
        <b className="pm-barra__valor">{formatearPm(valor)}</b>
        {foda && <FodaChip foda={foda} />}
      </div>
    );
  }

  return (
    <div className="pm-barra pm-barra--detalle" data-estado={estado} data-foda={foda ?? undefined}>
      <div className="pm-barra__fila">
        <span className="pm-barra__etiqueta">{parcial ? `${etiqueta} (parcial)` : etiqueta}</span>
        <span className="pm-barra__valor">{formatearPm(valor)}</span>
      </div>
      {medidor}
      <div className="pm-barra__escala">
        <span>{formatearCota(MIN)}</span>
        <span>umbral {formatearCota(umbral)}</span>
        {foda && <FodaChip foda={foda} />}
        <span>{formatearCota(MAX)}</span>
      </div>
    </div>
  );
}
