/** Formato de presentación de la ponderación media: dos decimales y coma (BRIEF §12.3). */
export function formatearPm(valor: number | null | undefined): string {
  return valor == null ? '—' : valor.toFixed(2).replace('.', ',');
}

/** Formato de una cota de la escala (p. ej. umbral): un decimal y coma («3,0»). */
export function formatearCota(valor: number): string {
  return valor.toFixed(1).replace('.', ',');
}

/**
 * Duración legible: «850 ms», «1,2 s», «2 min 5 s». Una duración ausente o inválida es una raya.
 */
export function formatearDuracion(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(Math.floor(ms / 100) / 10).toFixed(1).replace('.', ',')} s`;
  const segundos = Math.round(ms / 1000);
  return `${Math.floor(segundos / 60)} min ${segundos % 60} s`;
}

/** Hora local de una marca de tiempo ISO en 24 h («10:03:25»); una fecha inválida es una raya. */
export function formatearHora(iso: string | null | undefined): string {
  if (iso == null) return '—';
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '—';
  return fecha.toLocaleTimeString('es-EC', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
