// Acceso a datos del recálculo. La interfaz permite probar las funciones sin base de datos;
// la implementación real (service_role) está en `repositorio_supabase.ts`.

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
}

export interface Repositorio {
  /** Los subfactores del catálogo, ordenados por factor y por subfactor. */
  catalogo(): Promise<SubfactorCatalogo[]>;
  /** Crea el cálculo `en_proceso` y devuelve su id. */
  crearCalculo(datos: NuevoCalculo): Promise<number>;
  crearPasos(idCalculo: number, idsSubfactor: number[]): Promise<void>;
  obtenerCalculo(idCalculo: number): Promise<Calculo | null>;
  actualizarCalculo(
    idCalculo: number,
    cambios: { estado?: EstadoCalculo; progreso?: number; mensaje_error?: string | null },
  ): Promise<void>;
  listarPasos(idCalculo: number): Promise<Paso[]>;
  /**
   * Guarda las referencias aceptadas (sin duplicar por `(cálculo, subfactor, doi)`) y marca el
   * paso como `hecho`. Repetirlo con los mismos datos no cambia nada: los pasos son idempotentes.
   */
  completarPaso(
    idCalculo: number,
    idSubfactor: number,
    referencias: NuevaReferencia[],
    candidatos: number,
  ): Promise<void>;
  marcarPasoConError(idCalculo: number, idSubfactor: number, detalle: string): Promise<void>;
}
