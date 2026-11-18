/**
 * Modelo del módulo de administración de la importancia sugerida (P-08..P-10, issue #11).
 * Las pantallas solo conocen estos tipos y la interfaz `ApiAdmin`; la implementación con
 * Supabase está en `apiSupabase.ts`.
 */
import type { Importancia } from '../guios-core';

export type EstadoCalculo =
  'en_proceso' | 'pausado' | 'completado' | 'publicado' | 'descartado' | 'fallido';

export type FuenteBibliografica = 'openalex' | 'crossref';

export const FUENTES: readonly { id: FuenteBibliografica; nombre: string }[] = [
  { id: 'openalex', nombre: 'OpenAlex' },
  { id: 'crossref', nombre: 'Crossref' },
];

/** Parámetros guardados por `recalculo-iniciar` (RNF-09). */
export interface ParametrosCalculo {
  anio_inicio?: number;
  anio_fin?: number;
  fuentes?: string[];
  umbral?: number;
  modelo?: string;
  proveedor_llm?: string;
  version_prompt?: string;
  max_candidatos?: number;
}

export interface CalculoResumen {
  id: number;
  origen: 'tesis' | 'ia';
  anioInicio: number | null;
  anioFin: number | null;
  etiquetaRango: string | null;
  basesDatos: string | null;
  fecha: string;
  vigente: boolean;
  estado: EstadoCalculo;
  /** Factores (0..18) con todos sus subfactores procesados. */
  progreso: number;
  mensajeError: string | null;
  parametros: ParametrosCalculo | null;
}

/** Una fila de `sugerida_factor`. */
export interface FilaSugerida {
  idFactor: number;
  subfactores: number;
  citas: number;
  razon: number;
  ie: Importancia;
  il: Importancia;
  is: Importancia;
}

export interface SubfactorCatalogo {
  id: number;
  enunciado: string;
  orden: number;
}

export interface FactorCatalogo {
  id: number;
  nombre: string;
  orden: number;
  subfactores: SubfactorCatalogo[];
}

export interface ReferenciaCalculo {
  id: number;
  idSubfactor: number;
  titulo: string;
  anio: number;
  doi: string;
  base: string | null;
}

/** Resultado de `conteo_citas`: c_i = suma de las citas de los subfactores del factor. */
export interface ConteoCitas {
  idFactor: number;
  subfactores: number;
  citas: number;
}

export interface EntradaRecalculo {
  anioInicio: number;
  anioFin: number;
  fuentes: FuenteBibliografica[];
}

/** Respuesta de `recalculo-paso`. */
export interface ResultadoPaso {
  progreso: number;
  pendientes: number;
  estado: string;
}

/** Error de la API con el mensaje en español que se muestra al administrador. */
export class ErrorAdmin extends Error {
  readonly codigo: string | null;
  /** Estado del cálculo informado por la Edge Function (p. ej. `pausado`). */
  readonly estado: string | null;

  constructor(mensaje: string, codigo: string | null = null, estado: string | null = null) {
    super(mensaje);
    this.name = 'ErrorAdmin';
    this.codigo = codigo;
    this.estado = estado;
  }
}

/** Operaciones del administrador sobre los cálculos de IS (BRIEF §11). */
export interface ApiAdmin {
  listarCalculos(): Promise<CalculoResumen[]>;
  obtenerCalculo(id: number): Promise<CalculoResumen | null>;
  filasSugeridas(id: number): Promise<FilaSugerida[]>;
  catalogo(): Promise<FactorCatalogo[]>;
  referencias(id: number): Promise<ReferenciaCalculo[]>;
  iniciarRecalculo(entrada: EntradaRecalculo): Promise<number>;
  pasoRecalculo(id: number): Promise<ResultadoPaso>;
  pausar(id: number): Promise<void>;
  conteoCitas(id: number): Promise<ConteoCitas[]>;
  guardarResultado(id: number, filas: FilaSugerida[]): Promise<void>;
  publicar(id: number): Promise<void>;
  descartar(id: number): Promise<void>;
}
