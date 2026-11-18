import type { Foda, Importancia } from '../guios-core/escalas';
import { IMPORTANCIA } from '../guios-core/escalas';
import { formatearPm } from './formato';

export interface FactorFoda {
  id: string;
  nombre: string;
  foda: Foda;
  /** Importancia relativa en texto (p. ej. «Importante»); opcional. */
  ir?: (typeof IMPORTANCIA)[Importancia];
  /** Ponderación media (1..4); opcional. */
  pm?: number | null;
}

export interface FodaMatrixProps {
  factores: readonly FactorFoda[];
  /** Si se entrega, cada factor es un botón que emite su id (ir a sus subfactores). */
  onSeleccionarFactor?: ((id: string) => void) | undefined;
  /** Texto de un cuadrante sin factores; por defecto «Sin factores». */
  textoVacio?: string;
}

interface Cuadrante {
  foda: Foda;
  titulo: string;
}

/** Orden de la matriz: fila interna (F, D) y fila externa (O, A), como en el prototipo. */
const FILAS: readonly { eje: 'Interno' | 'Externo'; cuadrantes: readonly Cuadrante[] }[] = [
  {
    eje: 'Interno',
    cuadrantes: [
      { foda: 'Fortaleza', titulo: 'Fortalezas' },
      { foda: 'Debilidad', titulo: 'Debilidades' },
    ],
  },
  {
    eje: 'Externo',
    cuadrantes: [
      { foda: 'Oportunidad', titulo: 'Oportunidades' },
      { foda: 'Amenaza', titulo: 'Amenazas' },
    ],
  },
];

/** Matriz FODA de 2×2: el texto de cada cuadrante acompaña siempre al color (BRIEF §12.2). */
export function FodaMatrix({
  factores,
  onSeleccionarFactor,
  textoVacio = 'Sin factores',
}: FodaMatrixProps) {
  return (
    <div role="group" aria-label="Matriz FODA" className="foda">
      <div className="foda__eje" aria-hidden="true" />
      <div className="foda__eje">Ponderación ≥ 3</div>
      <div className="foda__eje">Ponderación &lt; 3</div>
      {FILAS.map((fila) => (
        <FilaFoda
          key={fila.eje}
          {...fila}
          factores={factores}
          onSeleccionarFactor={onSeleccionarFactor}
          textoVacio={textoVacio}
        />
      ))}
    </div>
  );
}

interface FilaFodaProps {
  eje: string;
  cuadrantes: readonly Cuadrante[];
  factores: readonly FactorFoda[];
  onSeleccionarFactor?: ((id: string) => void) | undefined;
  textoVacio: string;
}

function FilaFoda({ eje, cuadrantes, factores, onSeleccionarFactor, textoVacio }: FilaFodaProps) {
  return (
    <>
      <div className="foda__eje foda__eje--vertical">{eje}</div>
      {cuadrantes.map(({ foda, titulo }) => {
        const delCuadrante = factores.filter((f) => f.foda === foda);
        const idTitulo = `foda-${foda}`;
        return (
          <section
            key={foda}
            className="foda__cuadrante"
            data-foda={foda}
            aria-labelledby={idTitulo}
          >
            <h4 id={idTitulo} className="foda__titulo">
              <span>{titulo}</span>
              <span>{delCuadrante.length}</span>
            </h4>
            {delCuadrante.length === 0 ? (
              <span className="foda__vacio">{textoVacio}</span>
            ) : (
              <ul className="foda__lista">
                {delCuadrante.map((factor) => (
                  <li key={factor.id}>
                    <ContenidoFactor factor={factor} onSeleccionar={onSeleccionarFactor} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

function ContenidoFactor({
  factor,
  onSeleccionar,
}: {
  factor: FactorFoda;
  onSeleccionar?: ((id: string) => void) | undefined;
}) {
  const contenido = (
    <>
      <span>{factor.nombre}</span>
      {factor.ir && <small className="foda__detalle">{factor.ir}</small>}
      {factor.pm != null && <small className="foda__detalle">{formatearPm(factor.pm)}</small>}
    </>
  );
  if (!onSeleccionar) return <span className="foda__factor">{contenido}</span>;
  return (
    <button
      type="button"
      className="foda__factor"
      title="Ver subfactores"
      onClick={() => onSeleccionar(factor.id)}
    >
      {contenido}
    </button>
  );
}
