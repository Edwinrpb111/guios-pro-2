/** Formato de presentación de la ponderación media: dos decimales y coma (BRIEF §12.3). */
export function formatearPm(valor: number | null | undefined): string {
  return valor == null ? '—' : valor.toFixed(2).replace('.', ',');
}

/** Formato de una cota de la escala (p. ej. umbral): un decimal y coma («3,0»). */
export function formatearCota(valor: number): string {
  return valor.toFixed(1).replace('.', ',');
}

/** Entero con punto de millares («1.234»), igual en cualquier entorno. */
export function formatearEntero(valor: number): string {
  return String(Math.round(valor)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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

/**
 * Tiempo restante estimado, redondeado al minuto: «menos de 1 min», «aprox. 10 min»,
 * «aprox. 1 h 15 min». Una estimación ausente o inválida es una raya.
 */
export function formatearRestante(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const minutos = Math.round(ms / 60_000);
  if (ms < 60_000) return 'menos de 1 min';
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `aprox. ${minutos} min`;
  return resto === 0 ? `aprox. ${horas} h` : `aprox. ${horas} h ${resto} min`;
}
