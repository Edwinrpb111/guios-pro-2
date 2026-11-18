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

/** 429, 5xx, caída de red o clave rechazada: el cálculo queda en `pausado` (BRIEF §13.5). */
export class ErrorProveedorNoDisponible extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorProveedorNoDisponible';
  }
}

/** La API respondió, pero con algo que no se puede interpretar. */
export class ErrorRespuestaInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorRespuestaInvalida';
  }
}
