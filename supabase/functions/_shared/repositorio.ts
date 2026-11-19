// Acceso a datos del recálculo. La interfaz permite probar las funciones sin base de datos;
// la implementación real (service_role) está en `supabase_real.ts`.
import type { RegistroPaso } from './registro.ts';

export interface SubfactorCatalogo {
  id_subfactor: number;
  id_factor: number;
  orden_factor: number;
  nombre_factor: string;
  orden: number;
  enunciado: string;
}

export type EstadoCalculo =
  'en_proceso' | 'pausado' | 'completado' | 'publicado' | 'descartado' | 'fallido';

export type EstadoPaso = 'pendiente' | 'hecho' | 'error';

/** Parámetros del cálculo guardados para poder reproducirlo (BRIEF §13.5, RNF-09). */
export interface ParametrosCalculo {
  anio_inicio: number;
  anio_fin: number;
  fuentes: string[];
  umbral: number;
  modelo: string;
  proveedor_llm: string;
  version_prompt: string;
  max_candidatos: number;
}

export interface NuevoCalculo {
  anio_inicio: number;
  anio_fin: number;
  bases_datos: string;
  parametros: ParametrosCalculo;
  creado_por: string;
}

export interface Calculo {
  id_calculo: number;
  origen: string;
  estado: EstadoCalculo;
  progreso: number;
  parametros: Partial<ParametrosCalculo> | null;
}

export interface Paso {
  id_subfactor: number;
  estado: EstadoPaso;
}

export interface NuevaReferencia {
  titulo: string;
  anio: number;
  doi: string;
  base_datos: string;
  /** Confianza (0..1) que dio la IA; `null` si no fue un número válido (issue #46). */
  confianza: number | null;
  /**
   * Frase de la IA que justifica el veredicto: texto NO confiable, ya limpio y de 500 caracteres
   * como máximo; `null` si vino vacía (issue #46). No se escribe en los registros.
   */
  evidencia: string | null;
}

/**
 * Candidato que la IA clasificó y no aceptó (`trata_subfactor` falso o confianza bajo el umbral).
 * Mismos campos que una referencia aceptada, en la tabla `referencia_rechazada` (issue #46).
 */
export type NuevaReferenciaRechazada = NuevaReferencia;

export interface Repositorio {
  /** Los subfactores del catálogo, ordenados por factor y por subfactor. */
  catalogo(): Promise<SubfactorCatalogo[]>;
  /**
   * Crea, en una sola transacción, el cálculo `en_proceso` y un paso `pendiente` por cada
   * subfactor del catálogo; devuelve su id. Si algo falla no queda nada creado.
   */
  crearCalculoConPasos(datos: NuevoCalculo): Promise<number>;
  obtenerCalculo(idCalculo: number): Promise<Calculo | null>;
  actualizarCalculo(
    idCalculo: number,
    cambios: { estado?: EstadoCalculo; progreso?: number; mensaje_error?: string | null },
  ): Promise<void>;
  listarPasos(idCalculo: number): Promise<Paso[]>;
  /**
   * Guarda las referencias aceptadas (sin duplicar por `(cálculo, subfactor, doi)`) y los
   * candidatos rechazados, y marca el paso como `hecho`. Los pasos son idempotentes (issue #46):
   * repetirlo con los mismos datos no cambia nada, una referencia ya guardada actualiza su
   * confianza y evidencia, y los rechazados del subfactor se REEMPLAZAN (se borran los del
   * intento anterior y se insertan los nuevos).
   */
  completarPaso(
    idCalculo: number,
    idSubfactor: number,
    referencias: NuevaReferencia[],
    rechazadas: NuevaReferenciaRechazada[],
    candidatos: number,
  ): Promise<void>;
  marcarPasoConError(idCalculo: number, idSubfactor: number, detalle: string): Promise<void>;
  /** Intentos ya registrados de un paso (0 si nunca se intentó): el próximo es este + 1. */
  intentosDelPaso(idCalculo: number, idSubfactor: number): Promise<number>;
  /**
   * Guarda el registro de un intento (issue #43): al empezar, con `iniciado_en` y `duracion_ms`
   * nula; al terminar, con la duración y el registro final. No toca `estado` ni `detalle`.
   */
  guardarRegistroPaso(
    idCalculo: number,
    idSubfactor: number,
    datos: { iniciado_en?: string; duracion_ms: number | null; registro: RegistroPaso },
  ): Promise<void>;
}
