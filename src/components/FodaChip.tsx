import type { Foda } from '../guios-core/escalas';

export interface FodaChipProps {
  /** Clasificación FODA; sin valor se muestra «Sin evaluar». */
  foda?: Foda | null | undefined;
}

/** Etiqueta con la clasificación FODA. El texto siempre acompaña al color (BRIEF §12.2). */
export function FodaChip({ foda }: FodaChipProps) {
  const texto = foda ?? 'Sin evaluar';
  return (
    <span className="chip" data-foda={texto}>
      {texto}
    </span>
  );
}
