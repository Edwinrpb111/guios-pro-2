/**
 * Modelo plano que la capa de datos entrega a las pantallas (BRIEF §11.1).
 * Es independiente de las filas de Supabase: los alcances y las escalas ya vienen
 * validados y tipados con los tipos de `guios-core`.
 */
import type {
  Alcance,
  AlcanceCatalogo,
  CausaRecomendacion,
  Cumplimiento,
  Foda,
  Importancia,
} from '../guios-core';

export interface FactorCatalogo {
  id: number;
  nombre: string;
  /** Alcance del catálogo; solo Soporte es «Ambos» (RN-04). */
  alcance: AlcanceCatalogo;
  orden: number;
  /** Ids de los subfactores del factor, en su orden. */
  idsSubfactores: readonly number[];
}

export interface DimensionCatalogo {
  id: number;
  nombre: string;
  factores: readonly FactorCatalogo[];
}

export interface Catalogo {
  dimensiones: readonly DimensionCatalogo[];
  /** Enunciado de cada subfactor, por id (P-05 y el informe). */
  subfactores: Readonly<Record<number, string>>;
}

/** IE, IL e IS de un factor en un cálculo de importancia sugerida. */
export interface ImportanciaSugerida {
  ie: Importancia;
  il: Importancia;
  is: Importancia;
}

export interface CalculoResumen {
  id: number;
  /** Texto para mostrar: «Cálculo inicial de la tesis» o «Recálculo IA 2020–2025». */
  nombre: string;
  /** Rango o etiqueta del cálculo («RSL de la tesis», «2020–2025»). */
  rango: string;
  /** Fecha del cálculo (ISO 8601). */
  fecha: string;
  bases: string | null;
}

export interface CalculoImportancia extends CalculoResumen {
  /** Importancia sugerida por id de factor. */
  porFactor: Readonly<Record<number, ImportanciaSugerida>>;
}

export type EstadoEvaluacion = 'en_curso' | 'finalizada';
export type CodigoRecomendacion = 'A' | 'B' | 'C';

/** Fila del historial (P-02): lo mínimo para mostrar la evaluación y su avance. */
export interface ResumenEvaluacion {
  id: number;
  titulo: string;
  estado: EstadoEvaluacion;
  codigo: CodigoRecomendacion | null;
  /** Última modificación (ISO 8601). */
  fecha: string;
  software: { nombre: string; version: string; licencia: string } | null;
  organizacion: string | null;
  /** Una fila por factor al que el decisor ya le asignó importancia. */
  factoresValorados: readonly {
    idFactor: number;
    relevante: boolean;
    subfactoresValorados: number;
  }[];
}

export interface Contexto {
  titulo: string;
  software: { id: number | null; nombre: string; version: string; licencia: string };
  organizacion: { id: number | null; nombre: string; sector: string; pais: string };
}

export interface ValoracionFactor {
  idFactor: number;
  /** Importancia dada por el decisor (ID). */
  id: Importancia;
  alcance: Alcance;
  /** Cumplimiento (PS) por id de subfactor; solo los ya valorados. */
  cumplimientos: Readonly<Record<number, Cumplimiento>>;
}

/** Recomendación guardada al finalizar (fotografía, BRIEF §5.9). */
export interface RecomendacionGuardada {
  codigo: CodigoRecomendacion;
  texto: string;
  causas: readonly CausaRecomendacion[];
}

export interface EvaluacionDetalle {
  id: number;
  estado: EstadoEvaluacion;
  /** Última modificación (ISO 8601); en una finalizada, la fecha en que se finalizó. */
  fecha: string;
  /** Lo guardado al finalizar; `null` mientras está en curso. */
  recomendacion: RecomendacionGuardada | null;
  /** Cálculo de importancia sugerida con el que se creó la evaluación. */
  idCalculo: number;
  contexto: Contexto;
  valoraciones: readonly ValoracionFactor[];
}

/** Lo que se guarda de un factor: la entrada del decisor y los derivados (fotografía, BRIEF §8.3). */
export interface FilaValoracionFactor {
  idFactor: number;
  id: Importancia;
  alcance: Alcance;
  ir: Importancia;
  relevante: boolean;
  pm: number | null;
  foda: Foda | null;
}

/** Lo que se guarda al finalizar: la fotografía de los factores y la recomendación (BRIEF §11.1). */
export interface Finalizacion {
  /** Derivados de todos los factores valorados, recalculados al finalizar. */
  factores: readonly FilaValoracionFactor[];
  recomendacion: RecomendacionGuardada;
}
