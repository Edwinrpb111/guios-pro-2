// Tope de tiempo por invocación de `recalculo-paso` (issue #43, S15a, ADR-013).
//
// Una Edge Function vive 150 s como máximo (BRIEF §13.2) y, si se pasa, la plataforma la corta y
// no se guarda nada. Antes solo las esperas de ritmo y de reintento tenían tope (90 s, ADR-011):
// cada llamada a Gemini podía sumar hasta 60 s más y un subfactor con 5 lotes superaba los 150 s.
// El presupuesto cuenta el reloj de pared de TODO el paso (búsquedas, llamadas a la IA, esperas y
// reintentos) y cada `fetch` usa como máximo lo que queda.
import { ErrorPasoSinTiempo } from './errores.ts';

/** Tiempo total de un paso. Deja 40 s de margen sobre los 150 s de la función para guardar. */
export const PRESUPUESTO_PASO_MS = 110_000;

/**
 * Tiempo mínimo que debe quedar para empezar un lote o un reintento. Una llamada a la IA puede
 * tardar hasta 30 s: con menos de 15 s lo más probable es que la corte el tope a medias y se
 * gaste cuota sin guardar nada, así que es mejor pausar y reanudar.
 */
export const TIEMPO_MINIMO_LOTE_MS = 15_000;

/** Una señal de aborto y si fue el presupuesto (y no el tiempo propio del fetch) quien la acotó. */
export interface SenalLimitada {
  signal: AbortSignal;
  porPresupuesto: boolean;
}

export class PresupuestoPaso {
  readonly inicio: number;
  readonly #ahora: () => number;
  readonly #totalMs: number;
  readonly #crearSenal: (ms: number) => AbortSignal;

  /**
   * `ahora` es el reloj inyectable de las dependencias; `crearSenal` solo se reemplaza en las
   * pruebas para no usar temporizadores reales.
   */
  constructor(opciones: {
    ahora: () => number;
    totalMs?: number;
    crearSenal?: (ms: number) => AbortSignal;
  }) {
    this.#ahora = opciones.ahora;
    this.#totalMs = opciones.totalMs ?? PRESUPUESTO_PASO_MS;
    this.#crearSenal = opciones.crearSenal ?? ((ms) => AbortSignal.timeout(ms));
    this.inicio = this.#ahora();
  }

  ahora(): number {
    return this.#ahora();
  }

  /** Milisegundos que quedan del paso; nunca negativo. */
  restante(): number {
    return Math.max(0, this.#totalMs - (this.#ahora() - this.inicio));
  }

  /**
   * Señal para un `fetch` con `min(propioMs, tiempo restante)`. Si ya no queda tiempo, ni siquiera
   * se llama: lanza `ErrorPasoSinTiempo`.
   */
  senal(propioMs: number): SenalLimitada {
    const restante = this.restante();
    if (restante <= 0) throw new ErrorPasoSinTiempo();
    return {
      signal: this.#crearSenal(Math.max(1, Math.ceil(Math.min(propioMs, restante)))),
      porPresupuesto: restante <= propioMs,
    };
  }

  /** No se empieza un lote (ni un reintento) con menos de `TIEMPO_MINIMO_LOTE_MS`. */
  exigirTiempoParaLote(): void {
    if (this.restante() < TIEMPO_MINIMO_LOTE_MS) throw new ErrorPasoSinTiempo();
  }
}

/** Señal de un `fetch`: con presupuesto, acotada por lo que queda; sin él, solo su tiempo propio. */
export function senalDe(presupuesto: PresupuestoPaso | undefined, propioMs: number): SenalLimitada {
  return (
    presupuesto?.senal(propioMs) ?? { signal: AbortSignal.timeout(propioMs), porPresupuesto: false }
  );
}

/** ¿El `fetch` falló porque se agotó el tiempo de su señal (y no por la red)? */
export function esErrorDeTiempo(error: unknown): boolean {
  return (
    error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}
