/**
 * Reglas de negocio RN-01..RN-08 (BRIEF §4.3), tal cual la tesis.
 */
import {
  esCumplimiento,
  esImportancia,
  type Alcance,
  type AlcanceCatalogo,
  type Cumplimiento,
  type Foda,
  type Importancia,
} from './escalas';
import type { CodigoRecomendacion } from './textos';

/** RN-03: un factor es relevante si IR > UMBRAL_RELEVANCIA (pendiente de confirmar, BRIEF §17.1). */
export const UMBRAL_RELEVANCIA = 1;

/** RN-07: PM ≥ UMBRAL_FODA es favorable (Fortaleza u Oportunidad). */
export const UMBRAL_FODA = 3;

/** RN-04: alcance por defecto de Soporte. */
export const ALCANCE_SOPORTE_POR_DEFECTO: Alcance = 'Interno';

const verificarImportancia = (valor: number): void => {
  if (!esImportancia(valor)) throw new RangeError(`Importancia fuera de 1..4: ${valor}`);
};

/** RN-02 / RN-10: función de intersección de la Figura 5.10, `floor((a + b) / 2)`. */
export function interseccion(a: Importancia, b: Importancia): Importancia {
  verificarImportancia(a);
  verificarImportancia(b);
  return Math.floor((a + b) / 2) as Importancia;
}

/** RN-03. */
export const esRelevante = (ir: Importancia): boolean => ir > UMBRAL_RELEVANCIA;

/** RN-04: alcance con que se evalúa el factor; solo "Ambos" (Soporte) admite elección. */
export const alcanceEfectivo = (
  catalogo: AlcanceCatalogo,
  elegido: Alcance = ALCANCE_SOPORTE_POR_DEFECTO,
): Alcance => (catalogo === 'Ambos' ? elegido : catalogo);

/**
 * RN-06: promedio aritmético exacto de los PS. `null` si falta algún valor
 * (factor no evaluado, BRIEF §5.8) o si no hay subfactores.
 */
export function ponderacionMedia(ps: readonly (Cumplimiento | null)[]): number | null {
  if (ps.length === 0) return null;
  let suma = 0;
  for (const valor of ps) {
    if (valor === null) return null;
    if (!esCumplimiento(valor)) throw new RangeError(`Cumplimiento fuera de 1..4: ${valor}`);
    suma += valor;
  }
  return suma / ps.length;
}

/** RN-07: se clasifica con la PM sin redondear (BRIEF §5.7). */
export function clasificarFoda(pm: number, alcance: Alcance): Foda {
  const favorable = pm >= UMBRAL_FODA;
  if (alcance === 'Interno') return favorable ? 'Fortaleza' : 'Debilidad';
  return favorable ? 'Oportunidad' : 'Amenaza';
}

export interface EntradaFactor {
  readonly nombre: string;
  /** Alcance efectivo (ver `alcanceEfectivo`). */
  readonly alcance: Alcance;
  /** Importancia sugerida vigente. */
  readonly is: Importancia;
  /** Importancia dada por el decisor. */
  readonly id: Importancia;
  /** PS de cada subfactor; `null` = sin valorar. */
  readonly ps: readonly (Cumplimiento | null)[];
}

export type EstadoFactor = 'no_relevante' | 'pendiente' | 'evaluado';

export interface ResultadoFactor {
  readonly nombre: string;
  readonly ir: Importancia;
  readonly relevante: boolean;
  readonly pm: number | null;
  readonly foda: Foda | null;
  readonly estado: EstadoFactor;
}

/** Aplica RN-02, RN-03, RN-06 y RN-07 a un factor. */
export function evaluarFactor(entrada: EntradaFactor): ResultadoFactor {
  const { nombre, alcance, is, id, ps } = entrada;
  const ir = interseccion(is, id);
  if (!esRelevante(ir)) {
    return { nombre, ir, relevante: false, pm: null, foda: null, estado: 'no_relevante' };
  }
  const pm = ponderacionMedia(ps);
  if (pm === null) return { nombre, ir, relevante: true, pm, foda: null, estado: 'pendiente' };
  return { nombre, ir, relevante: true, pm, foda: clasificarFoda(pm, alcance), estado: 'evaluado' };
}

export interface CausaRecomendacion {
  readonly nombre: string;
  readonly foda: Foda;
  readonly ir: Importancia;
}

export interface Recomendacion {
  readonly codigo: CodigoRecomendacion;
  /** Factores que causan la recomendación (mejora CP1, BRIEF §4.4); vacío en A. */
  readonly causas: readonly CausaRecomendacion[];
}

const esDesfavorable = (foda: Foda): boolean => foda === 'Debilidad' || foda === 'Amenaza';

/**
 * RN-08: solo cuentan los factores evaluados. C si hay D/A con IR ≥ 3; B si hay
 * D/A con IR = 2; A en otro caso. `null` si no hay factores evaluados.
 */
export function recomendar(
  resultados: readonly Pick<ResultadoFactor, 'nombre' | 'ir' | 'foda'>[],
): Recomendacion | null {
  const desfavorables: CausaRecomendacion[] = [];
  let hayEvaluados = false;
  for (const { nombre, ir, foda } of resultados) {
    if (foda === null) continue;
    hayEvaluados = true;
    if (esDesfavorable(foda)) desfavorables.push({ nombre, foda, ir });
  }
  if (!hayEvaluados) return null;
  const graves = desfavorables.filter((c) => c.ir >= 3);
  if (graves.length > 0) return { codigo: 'C', causas: graves };
  const opcionales = desfavorables.filter((c) => c.ir === 2);
  if (opcionales.length > 0) return { codigo: 'B', causas: opcionales };
  return { codigo: 'A', causas: [] };
}
