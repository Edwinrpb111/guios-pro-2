/** Formato de presentación de la ponderación media: dos decimales y coma (BRIEF §12.3). */
export function formatearPm(valor: number | null | undefined): string {
  return valor == null ? '—' : valor.toFixed(2).replace('.', ',');
}

/** Formato de una cota de la escala (p. ej. umbral): un decimal y coma («3,0»). */
export function formatearCota(valor: number): string {
  return valor.toFixed(1).replace('.', ',');
}
