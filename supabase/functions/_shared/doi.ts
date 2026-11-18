// Normalización de DOI (BRIEF §13.2, paso 3c). Toda referencia guardada tiene un DOI.

const LONGITUD_MAXIMA = 200; // columna `referencia.doi varchar(200)`
const PREFIJO_URL = /^https?:\/\/(?:dx\.)?doi\.org\//;
const PREFIJO_DOI = /^doi:\s*/;
const FORMA_DOI = /^10\.\d{4,9}\/\S+$/;

/** Devuelve el DOI en minúsculas y sin prefijo, o `null` si no es un DOI válido. */
export function normalizarDoi(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor
    .trim()
    .toLowerCase()
    .replace(PREFIJO_URL, '')
    .replace(PREFIJO_DOI, '')
    .trim();
  return esDoiValido(limpio) ? limpio : null;
}

/** Verdadero solo para un DOI ya normalizado y que cabe en la columna. */
export function esDoiValido(doi: string): boolean {
  return doi.length <= LONGITUD_MAXIMA && doi === doi.toLowerCase() && FORMA_DOI.test(doi);
}
