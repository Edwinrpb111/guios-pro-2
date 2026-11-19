// Registro por paso del recálculo (issue #43, S15b, ADR-013). Lo escribe `recalculo-paso` en
// `recalculo_paso.registro` al terminar cada intento (bien o mal) y lo lee el administrador en la
// pantalla del recálculo. NUNCA contiene claves, direcciones, prompts ni textos de candidatos:
// solo conteos, tiempos y los mensajes propios de la función (que ya evitan esos datos).
import { ErrorProveedorNoDisponible, ErrorRespuestaInvalida, type MotivoLote } from './errores.ts';

export type ResultadoPaso = 'hecho' | 'pausado' | 'error';

export interface EntradaBusqueda {
  fuente: string;
  ms: number;
  /** Candidatos que devolvió la fuente (antes de depurar y deduplicar). */
  candidatos: number;
  error: string | null;
}

export interface EntradaLote {
  /** Número de lote dentro del paso, desde 1. */
  n: number;
  tamano: number;
  ms: number;
  reintentos: number;
  resultado: 'ok' | MotivoLote;
  aceptados: number;
  /** Tokens del `usage` del proveedor (enteros), o `null` si no los informó (issue #45). */
  tokens_entrada: number | null;
  tokens_salida: number | null;
  tokens_razonamiento: number | null;
}

/** Qué hace el paso mientras corre; `null` cuando terminó (issue #45). */
export type EtapaPaso = 'buscando' | 'clasificando' | 'guardando';

export interface RegistroPaso {
  /** 1 la primera vez; sube cada vez que se repite el mismo paso. */
  intento: number;
  proveedor: string;
  busqueda: EntradaBusqueda[];
  /** Tandas ya terminadas, en el orden en que terminaron (con varias a la vez no es el de `n`). */
  lotes: EntradaLote[];
  /** Etapa del paso en curso; `null` si ya terminó (bien, pausado o con error). */
  etapa: EtapaPaso | null;
  /** Tandas planificadas; `null` hasta que termina la búsqueda. */
  lotes_total: number | null;
  /** Referencias aceptadas y guardadas por este intento (0 si no terminó). */
  aceptados: number;
  resultado: ResultadoPaso;
  mensaje: string | null;
}

const MENSAJE_INTERRUMPIDO =
  'El paso no terminó: la plataforma lo cortó o la función falló antes de guardar su resultado.';
export const MENSAJE_INESPERADO =
  'Error inesperado en la función. El detalle está en los registros del servidor.';

/** Mensaje que se puede mostrar y guardar: solo el de los errores propios de las funciones. */
export function mensajeSeguro(error: unknown): string {
  return error instanceof ErrorProveedorNoDisponible || error instanceof ErrorRespuestaInvalida
    ? error.message
    : MENSAJE_INESPERADO;
}

/** Resultado del lote que falló, para el registro. */
export function motivoDe(error: unknown): MotivoLote {
  if (error instanceof ErrorProveedorNoDisponible) return error.motivo;
  if (error instanceof ErrorRespuestaInvalida) return 'respuesta_invalida';
  return 'error';
}

/** Tiempo máximo de cada escritura del progreso en la base. */
export const LIMITE_ESCRITURA_MS = 5_000;

/** Espera `promesa` hasta `ms`; después la abandona sin error y limpia el temporizador. */
function conLimite(promesa: Promise<void>, ms: number): Promise<void> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const vencida = new Promise<void>((resolver) => {
    temporizador = setTimeout(() => {
      console.error(JSON.stringify({ evento: 'registro_escritura_vencida', limite_ms: ms }));
      resolver();
    }, ms);
  });
  return Promise.race([promesa, vencida]).finally(() => clearTimeout(temporizador));
}

/** Escribe un registro parcial del paso; no debe lanzar (el registro es solo un apoyo). */
export type AlProgresar = (registro: RegistroPaso) => Promise<void>;

/**
 * Va anotando las búsquedas y los lotes de un intento y arma el registro. Con `alProgresar` cada
 * avance se escribe en la base mientras el paso corre (issue #45): las escrituras se encadenan
 * para que lleguen en orden aunque varias tandas terminen casi a la vez.
 */
export class RegistradorPaso {
  readonly busqueda: EntradaBusqueda[] = [];
  readonly lotes: EntradaLote[] = [];
  etapa: EtapaPaso | null = 'buscando';
  lotesTotal: number | null = null;
  #cola: Promise<void> = Promise.resolve();

  constructor(
    readonly proveedor: string,
    readonly intento: number,
    readonly alProgresar?: AlProgresar,
    /** Una escritura que tarda más se abandona: el registro no puede frenar el paso. */
    readonly limiteEscrituraMs = LIMITE_ESCRITURA_MS,
  ) {}

  anotarBusqueda(entrada: EntradaBusqueda): void {
    this.busqueda.push(entrada);
  }

  anotarLote(entrada: EntradaLote): void {
    this.lotes.push(entrada);
  }

  /** Terminó la búsqueda: ya se sabe cuántas tandas son. Guarda el avance. */
  clasificando(lotesTotal: number): Promise<void> {
    this.etapa = 'clasificando';
    this.lotesTotal = lotesTotal;
    return this.publicar();
  }

  /** Terminaron las tandas; falta guardar las referencias. Guarda el avance. */
  guardando(): Promise<void> {
    this.etapa = 'guardando';
    return this.publicar();
  }

  /** Escribe lo anotado hasta ahora. Nunca lanza. */
  publicar(): Promise<void> {
    const alProgresar = this.alProgresar;
    if (alProgresar === undefined) return Promise.resolve();
    const instantanea = this.interrumpido();
    const escritura = this.#cola.then(() =>
      conLimite(alProgresar(instantanea), this.limiteEscrituraMs),
    );
    this.#cola = escritura.catch(() => undefined);
    return this.#cola;
  }

  /** Espera a que se terminen de escribir los avances pendientes. */
  vaciar(): Promise<void> {
    return this.#cola;
  }

  /**
   * Lo que queda guardado mientras el intento corre: al EMPEZAR y tras cada avance. Si la
   * plataforma corta la función, esto es lo que se ve (con `duracion_ms` nula) y conserva el número
   * de intento para el siguiente. El resultado y el mensaje son los de un paso cortado: la pantalla
   * los ignora mientras haya `etapa`.
   */
  interrumpido(): RegistroPaso {
    return {
      intento: this.intento,
      proveedor: this.proveedor,
      busqueda: [...this.busqueda],
      lotes: [...this.lotes],
      etapa: this.etapa,
      lotes_total: this.lotesTotal,
      aceptados: 0,
      resultado: 'error',
      mensaje: MENSAJE_INTERRUMPIDO,
    };
  }

  /** El registro final del intento, con todo lo anotado y sin etapa. */
  cerrar(resultado: ResultadoPaso, mensaje: string | null, aceptados: number): RegistroPaso {
    return {
      intento: this.intento,
      proveedor: this.proveedor,
      busqueda: [...this.busqueda],
      lotes: [...this.lotes],
      etapa: null,
      lotes_total: this.lotesTotal,
      aceptados,
      resultado,
      mensaje,
    };
  }
}
