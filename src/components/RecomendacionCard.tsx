import { IMPORTANCIA, type Foda, type Importancia } from '../guios-core/escalas';
import type { CodigoRecomendacion } from '../guios-core/textos';
import { FodaChip } from './FodaChip';

export interface CausaCard {
  nombre: string;
  foda: Foda;
  ir: Importancia;
}

export interface RecomendacionCardProps {
  /** `null` si ningún factor está evaluado: no hay recomendación (RN-08). */
  codigo: CodigoRecomendacion | null;
  titulo?: string;
  texto?: string;
  /** Factores que causan la recomendación (mejora del CP1, BRIEF §4.4). */
  causas?: readonly CausaCard[];
}

/**
 * Recomendación A, B o C con su texto y los factores que la causan (BRIEF §12.2).
 * La letra y la clasificación siempre van en texto, no solo en color.
 */
export function RecomendacionCard({
  codigo,
  titulo = '',
  texto = '',
  causas = [],
}: RecomendacionCardProps) {
  if (codigo === null) {
    return (
      <section className="recomendacion tarjeta tarjeta--relleno" aria-label="Recomendación">
        <h2>Sin recomendación</h2>
        <p>
          Ningún factor está evaluado todavía. Valora todos los subfactores de al menos un factor
          relevante para obtener una recomendación.
        </p>
      </section>
    );
  }
  return (
    <section
      className="recomendacion tarjeta tarjeta--relleno"
      data-recomendacion={codigo}
      aria-label="Recomendación"
    >
      <div className="recomendacion__cabecera">
        <span className="recomendacion__letra" data-codigo={codigo}>
          {codigo}
        </span>
        <div>
          <h2>{titulo}</h2>
          <p>{texto}</p>
        </div>
      </div>
      {causas.length === 0 ? (
        <p className="ayuda-texto">Ningún factor evaluado es debilidad ni amenaza.</p>
      ) : (
        <>
          <h3>Factores que causan esta recomendación</h3>
          <ul className="recomendacion__causas" aria-label="Factores que causan la recomendación">
            {causas.map((causa) => (
              <li key={causa.nombre}>
                <b>{causa.nombre}</b>
                <FodaChip foda={causa.foda} />
                <span className="ayuda-texto">Importancia relativa: {IMPORTANCIA[causa.ir]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
