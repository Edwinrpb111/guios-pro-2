// Ritmo de llamadas a Gemini (issue #39, S13). El plan gratis de Gemini permite pocas llamadas
// por minuto (alrededor de 15): sin freno, un paso con 50 candidatos (5 lotes) y un navegador
// que pide un subfactor tras otro agotan el cupo en segundos. Este módulo reparte las llamadas
// en el tiempo y decide cuánto esperar antes de reintentar un 429/503.
import { ErrorPasoSinTiempo, ErrorProveedorNoDisponible } from './errores.ts';
import { type PresupuestoPaso, TIEMPO_MINIMO_LOTE_MS } from './presupuesto.ts';

/** Hora y espera inyectables: las pruebas usan un reloj falso y nunca duermen de verdad. */
export interface Reloj {
  ahora(): number;
  esperar(ms: number): Promise<void>;
}

export const RELOJ_REAL: Reloj = {
  ahora: () => Date.now(),
  esperar: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
};

/** Ritmo por defecto: cabe en el plan gratis de Gemini (~15 por minuto). */
export const LLAMADAS_POR_MINUTO_POR_DEFECTO = 15;
export const LLAMADAS_POR_MINUTO_MAXIMO = 1000;

/** Tandas de un paso que se mandan a la IA a la vez (issue #45, S16a, ADR-014). */
export const LLAMADAS_SIMULTANEAS_POR_DEFECTO = 5;
export const LLAMADAS_SIMULTANEAS_MAXIMO = 10;

/** Reintentos tras un 429/503 antes de pausar el cálculo. */
export const REINTENTOS_MAXIMOS = 3;
/** Cada espera de reintento se limita a esto, aunque Gemini pida más. */
export const ESPERA_MAXIMA_REINTENTO_MS = 30_000;
/** Espera por defecto del primer reintento si Gemini no indica `retryDelay`; se duplica después. */
export const ESPERA_BASE_REINTENTO_MS = 5_000;
/**
 * Máximo de espera (ritmo + reintentos) por paso. Las Edge Functions viven 150 s como máximo
 * (BRIEF §13.2). Este tope solo cuenta las esperas; el tiempo total del paso (también las
 * llamadas) lo limita `PresupuestoPaso`, que `RitmoDeLlamadas` consulta si se le da uno (issue #43).
 */
export const ESPERA_TOTAL_MAXIMA_MS = 90_000;

/**
 * Lleva la cuenta de las llamadas de UN paso: separa cada llamada de la anterior al menos
 * `60000 / llamadasPorMinuto` ms y reparte un presupuesto de espera total. Se crea uno por paso.
 */
export class RitmoDeLlamadas {
  readonly #reloj: Reloj;
  readonly #intervaloMs: number;
  readonly #presupuestoMs: number;
  readonly #paso: PresupuestoPaso | undefined;
  #ultimaLlamada: number | undefined;
  /** Tiempo de pared esperado en este paso (las esperas simultáneas se cuentan una sola vez). */
  #esperado = 0;
  /** Hora hasta la que ya hay una espera contada: lo que se solape no se vuelve a sumar. */
  #hastaEsperado = 0;
  /** Cola de turnos: con tandas en paralelo, los turnos se reparten de uno en uno. */
  #cola: Promise<void> = Promise.resolve();
  #reintentos = 0;

  /** `paso`, si se da, limita además cada espera al tiempo que queda del paso (110 s). */
  constructor(
    reloj: Reloj,
    llamadasPorMinuto: number,
    presupuestoMs: number = ESPERA_TOTAL_MAXIMA_MS,
    paso?: PresupuestoPaso,
  ) {
    this.#reloj = reloj;
    this.#intervaloMs = 60_000 / llamadasPorMinuto;
    this.#presupuestoMs = presupuestoMs;
    this.#paso = paso;
  }

  /** Reintentos hechos hasta ahora en este paso (para el registro de cada lote). */
  get reintentos(): number {
    return this.#reintentos;
  }

  /** Pausa por tiempo si, tras esperar `espera` ms, ya no cabría una llamada (mínimo 15 s). */
  #exigirTiempo(espera: number): void {
    if (
      this.#paso !== undefined &&
      this.#paso.restante() - Math.max(espera, 0) < TIEMPO_MINIMO_LOTE_MS
    ) {
      throw new ErrorPasoSinTiempo();
    }
  }

  /** Tiempo de pared nuevo que sumaría una espera de `ms` que empieza ahora. */
  #incremento(ms: number): number {
    const ahora = this.#reloj.ahora();
    return Math.max(0, ahora + ms - Math.max(ahora, this.#hastaEsperado));
  }

  async #esperar(ms: number): Promise<void> {
    if (ms <= 0) return;
    const ahora = this.#reloj.ahora();
    this.#esperado += this.#incremento(ms);
    this.#hastaEsperado = Math.max(this.#hastaEsperado, ahora + ms);
    await this.#reloj.esperar(ms);
  }

  /**
   * Espera lo necesario antes de CADA llamada a Gemini. Como no se sabe cuándo fue la última
   * llamada del paso anterior, la primera de un paso espera el intervalo completo; las
   * siguientes solo lo que falte desde la anterior. Con varias tandas a la vez (issue #45) los
   * turnos se atienden de uno en uno, así el ritmo por minuto se respeta entre todas.
   */
  esperarTurno(): Promise<void> {
    const turno = this.#cola.then(() => this.#esperarTurno());
    this.#cola = turno.then(
      () => undefined,
      () => undefined,
    );
    return turno;
  }

  async #esperarTurno(): Promise<void> {
    const falta =
      this.#ultimaLlamada === undefined
        ? this.#intervaloMs
        : this.#ultimaLlamada + this.#intervaloMs - this.#reloj.ahora();
    // El ritmo también cuenta para el tope del paso: si no cabe, se pausa (y se reanuda luego)
    // en lugar de agotar el tiempo de la Edge Function.
    if (falta > 0 && this.#esperado + this.#incremento(falta) > this.#presupuestoMs) {
      throw new ErrorProveedorNoDisponible(
        'Las llamadas por minuto configuradas son muy pocas para completar este paso a tiempo. Sube las llamadas por minuto y reanuda el cálculo, o inicia uno nuevo con menos candidatos.',
      );
    }
    this.#exigirTiempo(falta);
    await this.#esperar(falta);
    this.#ultimaLlamada = this.#reloj.ahora();
  }

  /**
   * Espera antes del reintento número `intento` (0 = el primero) y devuelve `true`; devuelve
   * `false`, sin esperar, si ya se hicieron los reintentos permitidos o la espera no cabe en el
   * presupuesto del paso. `sugeridaMs` es el `retryDelay` de Gemini, si vino.
   */
  async esperarReintento(intento: number, sugeridaMs: number | null): Promise<boolean> {
    if (intento >= REINTENTOS_MAXIMOS) return false;
    const pedida = sugeridaMs ?? ESPERA_BASE_REINTENTO_MS * 2 ** intento;
    const espera = Math.min(pedida, ESPERA_MAXIMA_REINTENTO_MS);
    if (this.#esperado + this.#incremento(espera) > this.#presupuestoMs) return false;
    // Si esperar deja sin tiempo para la siguiente llamada, el que manda es el tope del paso.
    this.#exigirTiempo(espera);
    await this.#esperar(espera);
    this.#reintentos++;
    return true;
  }
}

/**
 * Cabecera `Retry-After` (en segundos) de un 429/503 de un proveedor compatible con OpenAI, en
 * milisegundos; `null` si falta o no es un número de segundos (no se interpretan fechas).
 */
export function leerRetryAfter(valor: string | null): number | null {
  const coincide = /^(\d+(?:\.\d+)?)$/.exec(valor?.trim() ?? '');
  return coincide?.[1] === undefined ? null : Math.ceil(Number(coincide[1]) * 1000);
}

/**
 * `retryDelay` de un error de Gemini (`google.rpc.RetryInfo`, p. ej. `"17s"` o `"0.5s"`) en
 * milisegundos, o `null` si el cuerpo no lo trae o no se entiende.
 */
export function leerEsperaSugerida(cuerpo: unknown): number | null {
  const detalles = (cuerpo as { error?: { details?: unknown } } | null)?.error?.details;
  if (!Array.isArray(detalles)) return null;
  for (const detalle of detalles) {
    const retryDelay = (detalle as { retryDelay?: unknown } | null)?.retryDelay;
    if (typeof retryDelay !== 'string') continue;
    const coincide = /^(\d+(?:\.\d+)?)s$/.exec(retryDelay.trim());
    if (coincide?.[1] !== undefined) return Math.ceil(Number(coincide[1]) * 1000);
  }
  return null;
}
