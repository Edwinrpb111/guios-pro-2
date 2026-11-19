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
}

export interface RegistroPaso {
  /** 1 la primera vez; sube cada vez que se repite el mismo paso. */
  intento: number;
  proveedor: string;
  busqueda: EntradaBusqueda[];
  lotes: EntradaLote[];
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

/** Va anotando las búsquedas y los lotes de un intento y arma el registro final. */
export class RegistradorPaso {
  readonly busqueda: EntradaBusqueda[] = [];
  readonly lotes: EntradaLote[] = [];

  constructor(
    readonly proveedor: string,
    readonly intento: number,
  ) {}

  anotarBusqueda(entrada: EntradaBusqueda): void {
    this.busqueda.push(entrada);
  }

  anotarLote(entrada: EntradaLote): void {
    this.lotes.push(entrada);
  }

  /**
   * Lo que queda guardado al EMPEZAR el intento: si la plataforma corta la función, esto es lo
   * que se ve (con `duracion_ms` nula) y conserva el número de intento para el siguiente.
   */
  interrumpido(): RegistroPaso {
    return {
      intento: this.intento,
      proveedor: this.proveedor,
      busqueda: [],
      lotes: [],
      aceptados: 0,
      resultado: 'error',
      mensaje: MENSAJE_INTERRUMPIDO,
    };
  }

  /** El registro final del intento, con todo lo anotado. */
  cerrar(resultado: ResultadoPaso, mensaje: string | null, aceptados: number): RegistroPaso {
    return {
      intento: this.intento,
      proveedor: this.proveedor,
      busqueda: [...this.busqueda],
      lotes: [...this.lotes],
      aceptados,
      resultado,
      mensaje,
    };
  }
}
