/**
 * Importancia de la literatura e importancia sugerida: RN-09 y RN-10 (BRIEF §4.3).
 */
import type { Importancia } from './escalas';
import { interseccion } from './reglas';

/** Variantes de percentil: "lineal" = numpy.percentile por defecto / PERCENTIL.INC; "inferior" = method='lower'. */
export type MetodoCuartiles = 'lineal' | 'inferior';

/** RN-09: método vigente (pendiente de confirmar, BRIEF §17.4). */
export const METODO_CUARTILES: MetodoCuartiles = 'lineal';

/** RN-10: importancia dada por los expertos, fija. */
export const IE_EXPERTOS: Importancia = 3;

export interface Cuartiles {
  readonly q1: number;
  readonly q2: number;
  readonly q3: number;
}

/** RN-09: `r_i = c_i / n_i`, con `c_i` = suma de citas por subfactor (BRIEF §5.6). */
export function razon(citas: number, subfactores: number): number {
  if (!(subfactores > 0)) throw new RangeError(`El factor debe tener subfactores: ${subfactores}`);
  if (!(citas >= 0)) throw new RangeError(`Citas inválidas: ${citas}`);
  return citas / subfactores;
}

function percentil(ordenados: readonly number[], p: number, metodo: MetodoCuartiles): number {
  const posicion = (ordenados.length - 1) * p;
  const inferior = Math.floor(posicion);
  const bajo = ordenados[inferior] as number;
  if (metodo === 'inferior') return bajo;
  const alto = ordenados[Math.min(inferior + 1, ordenados.length - 1)] as number;
  return bajo + (alto - bajo) * (posicion - inferior);
}

/** RN-09: q1, q2 y q3 de las razones. */
export function cuartiles(
  razones: readonly number[],
  metodo: MetodoCuartiles = METODO_CUARTILES,
): Cuartiles {
  if (razones.length === 0) throw new RangeError('Se necesita al menos una razón');
  const ordenados = [...razones].sort((a, b) => a - b);
  return {
    q1: percentil(ordenados, 0.25, metodo),
    q2: percentil(ordenados, 0.5, metodo),
    q3: percentil(ordenados, 0.75, metodo),
  };
}

/** RN-09: IL = 1 si r ≤ q1; 2 si ≤ q2; 3 si ≤ q3; 4 si > q3. */
export function il(r: number, { q1, q2, q3 }: Cuartiles): Importancia {
  if (r <= q1) return 1;
  if (r <= q2) return 2;
  if (r <= q3) return 3;
  return 4;
}

export interface EntradaLiteratura {
  readonly citas: number;
  readonly subfactores: number;
}

export interface ResultadoLiteratura {
  readonly r: number;
  readonly il: Importancia;
  readonly is: Importancia;
}

export interface RecalculoIS {
  readonly cuartiles: Cuartiles;
  /** En el mismo orden que la entrada. */
  readonly factores: readonly ResultadoLiteratura[];
}

/**
 * RN-09 + RN-10: recalcula IL e IS de todos los factores juntos (IL es relativa
 * al conjunto), con `IS = floor((IE + IL) / 2)`.
 */
export function recalcularIS(
  entradas: readonly EntradaLiteratura[],
  metodo: MetodoCuartiles = METODO_CUARTILES,
): RecalculoIS {
  const razones = entradas.map(({ citas, subfactores }) => razon(citas, subfactores));
  const q = cuartiles(razones, metodo);
  return {
    cuartiles: q,
    factores: razones.map((r) => {
      const ilFactor = il(r, q);
      return { r, il: ilFactor, is: interseccion(IE_EXPERTOS, ilFactor) };
    }),
  };
}

/** Conteo de un factor en un cálculo: `citas` = suma de las citas de sus subfactores (trampa 6). */
export interface ConteoFactor {
  readonly idFactor: number;
  readonly subfactores: number;
  readonly citas: number;
}

export interface ImportanciaFactor extends ConteoFactor {
  /** Razón exacta `c_i / n_i`; IL se clasifica sobre este valor, sin redondear. */
  readonly r: number;
  readonly ie: Importancia;
  readonly il: Importancia;
  readonly is: Importancia;
}

export interface ResultadoRecalculo {
  readonly cuartiles: Cuartiles;
  /** En el mismo orden que la entrada. */
  readonly factores: readonly ImportanciaFactor[];
}

/**
 * RN-09 + RN-10 sobre el conteo de un recálculo: IL e IS de cada factor, identificado por su id.
 * Todos los factores se calculan juntos porque IL es relativa a los cuartiles del conjunto.
 */
export function importanciaSugeridaPorFactor(
  conteos: readonly ConteoFactor[],
  metodo: MetodoCuartiles = METODO_CUARTILES,
): ResultadoRecalculo {
  const ids = new Set<number>();
  for (const { idFactor } of conteos) {
    if (ids.has(idFactor)) throw new RangeError(`Factor repetido en el conteo: ${idFactor}`);
    ids.add(idFactor);
  }
  const { cuartiles: q, factores } = recalcularIS(conteos, metodo);
  return {
    cuartiles: q,
    factores: conteos.map((conteo, i) => {
      const resultado = factores[i] as ResultadoLiteratura;
      return {
        idFactor: conteo.idFactor,
        subfactores: conteo.subfactores,
        citas: conteo.citas,
        r: resultado.r,
        ie: IE_EXPERTOS,
        il: resultado.il,
        is: resultado.is,
      };
    }),
  };
}
