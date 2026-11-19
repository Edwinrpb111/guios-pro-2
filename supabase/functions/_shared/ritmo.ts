// Ritmo de llamadas a Gemini (issue #39, S13). El plan gratis de Gemini permite pocas llamadas
// por minuto (alrededor de 15): sin freno, un paso con 50 candidatos (5 lotes) y un navegador
// que pide un subfactor tras otro agotan el cupo en segundos. Este módulo reparte las llamadas
// en el tiempo y decide cuánto esperar antes de reintentar un 429/503.
import { ErrorProveedorNoDisponible } from './errores.ts';

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

/** Reintentos tras un 429/503 antes de pausar el cálculo. */
export const REINTENTOS_MAXIMOS = 3;
/** Cada espera de reintento se limita a esto, aunque Gemini pida más. */
export const ESPERA_MAXIMA_REINTENTO_MS = 30_000;
/** Espera por defecto del primer reintento si Gemini no indica `retryDelay`; se duplica después. */
export const ESPERA_BASE_REINTENTO_MS = 5_000;
/**
 * Máximo de espera (ritmo + reintentos) por paso. Las Edge Functions viven 150 s como máximo
 * (BRIEF §13.2): con 90 s de espera quedan 60 s para las llamadas y para guardar.
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
  #ultimaLlamada: number | undefined;
  #esperado = 0;

  constructor(
    reloj: Reloj,
    llamadasPorMinuto: number,
    presupuestoMs: number = ESPERA_TOTAL_MAXIMA_MS,
  ) {
    this.#reloj = reloj;
    this.#intervaloMs = 60_000 / llamadasPorMinuto;
    this.#presupuestoMs = presupuestoMs;
  }

  async #esperar(ms: number): Promise<void> {
    if (ms <= 0) return;
    this.#esperado += ms;
    await this.#reloj.esperar(ms);
  }

  /**
   * Espera lo necesario antes de CADA llamada a Gemini. Como no se sabe cuándo fue la última
   * llamada del paso anterior, la primera de un paso espera el intervalo completo; las
   * siguientes solo lo que falte desde la anterior.
   */
  async esperarTurno(): Promise<void> {
    const falta =
      this.#ultimaLlamada === undefined
        ? this.#intervaloMs
        : this.#ultimaLlamada + this.#intervaloMs - this.#reloj.ahora();
    // El ritmo también cuenta para el tope del paso: si no cabe, se pausa (y se reanuda luego)
    // en lugar de agotar el tiempo de la Edge Function.
    if (falta > 0 && this.#esperado + falta > this.#presupuestoMs) {
      throw new ErrorProveedorNoDisponible(
        'Las llamadas por minuto configuradas son muy pocas para completar este paso a tiempo. Sube las llamadas por minuto o baja el máximo de candidatos y reanuda el cálculo.',
      );
    }
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
    if (this.#esperado + espera > this.#presupuestoMs) return false;
    await this.#esperar(espera);
    return true;
  }
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
