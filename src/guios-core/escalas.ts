/**
 * Escalas del método GUIOS (BRIEF §4.2). Siempre 1..4, nunca índices 0..3 (BRIEF §5.5).
 */

/** Importancia (IE, IL, IS, ID, IR) — RN-01. */
export type Importancia = 1 | 2 | 3 | 4;

/** Cumplimiento de un subfactor (PS) — RN-05. */
export type Cumplimiento = 1 | 2 | 3 | 4;

/** Alcance con el que se evalúa un factor. */
export type Alcance = 'Interno' | 'Externo';

/** Alcance fijado en el catálogo: "Ambos" solo existe para Soporte (RN-04). */
export type AlcanceCatalogo = Alcance | 'Ambos';

export type Foda = 'Fortaleza' | 'Debilidad' | 'Oportunidad' | 'Amenaza';

export const IMPORTANCIA: Readonly<Record<Importancia, string>> = {
  1: 'Irrelevante',
  2: 'Opcional',
  3: 'Importante',
  4: 'Fundamental',
};

export const CUMPLIMIENTO: Readonly<Record<Cumplimiento, string>> = {
  1: 'No cumple el requisito',
  2: 'Desconozco si cumple',
  3: 'Cumple parcialmente',
  4: 'Cumple el requisito',
};

export const ALCANCES: readonly Alcance[] = ['Interno', 'Externo'];

export const FODA: readonly Foda[] = ['Fortaleza', 'Debilidad', 'Oportunidad', 'Amenaza'];

const esValorEscala = (valor: number): boolean =>
  Number.isInteger(valor) && valor >= 1 && valor <= 4;

export const esImportancia = (valor: number): valor is Importancia => esValorEscala(valor);

export const esCumplimiento = (valor: number): valor is Cumplimiento => esValorEscala(valor);
