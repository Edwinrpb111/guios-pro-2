// Errores del recálculo. Los mensajes son legibles para el administrador y nunca incluyen
// claves ni direcciones con credenciales.

/** Error que se devuelve tal cual al cliente como `{error, codigo}`. */
export class ErrorApi extends Error {
  readonly estado: number;
  readonly codigo: string;
  readonly extra: Record<string, unknown>;

  constructor(
    estado: number,
    codigo: string,
    mensaje: string,
    extra: Record<string, unknown> = {},
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.estado = estado;
    this.codigo = codigo;
    this.extra = extra;
  }
}

/**
 * Por qué terminó mal una llamada a la IA (un lote), para el registro del paso (issue #43).
 * `error` agrupa lo demás: otro 5xx o una caída de red.
 */
export type MotivoLote =
  | 'reintento_agotado'
  | 'sin_tiempo'
  | 'clave_rechazada'
  | 'sin_saldo'
  | 'respuesta_invalida'
  | 'error';

/** 429, 5xx, caída de red o clave rechazada: el cálculo queda en `pausado` (BRIEF §13.5). */
export class ErrorProveedorNoDisponible extends Error {
  readonly motivo: MotivoLote;

  constructor(mensaje: string, motivo: MotivoLote = 'error') {
    super(mensaje);
    this.name = 'ErrorProveedorNoDisponible';
    this.motivo = motivo;
  }
}

/**
 * El paso agotó su tiempo (110 s por invocación, issue #43). Sigue el camino de pausa de
 * `ErrorProveedorNoDisponible`, pero el cálculo responde con su propio código (`paso_sin_tiempo`)
 * y un mensaje que nombra el subfactor, que arma `recalculo_paso.ts`.
 */
export class ErrorPasoSinTiempo extends ErrorProveedorNoDisponible {
  constructor(
    mensaje = 'El paso tardó más de lo permitido. Reduce el máximo de candidatos o sube las llamadas por minuto y reanuda.',
  ) {
    super(mensaje, 'sin_tiempo');
    this.name = 'ErrorPasoSinTiempo';
  }
}

/** La API respondió, pero con algo que no se puede interpretar. */
export class ErrorRespuestaInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorRespuestaInvalida';
  }
}
