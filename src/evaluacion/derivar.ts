/**
 * Une el catálogo, el cálculo de importancia sugerida y lo valorado por el decisor
 * y deja a `guios-core` toda la lógica del método (RN-02, RN-03, RN-04, RN-06, RN-07):
 * aquí solo se arman sus entradas y se presentan sus resultados.
 */
import type {
  CalculoImportancia,
  Catalogo,
  EvaluacionDetalle,
  FactorCatalogo,
  FilaValoracionFactor,
  RecomendacionGuardada,
  ValoracionFactor,
} from '../datos/tipos';
import {
  alcanceEfectivo,
  evaluarFactor,
  ponderacionMedia,
  recomendar,
  TEXTOS_RECOMENDACION,
  type Alcance,
  type AlcanceCatalogo,
  type CausaRecomendacion,
  type CodigoRecomendacion,
  type Cumplimiento,
  type EstadoFactor,
  type Foda,
  type Importancia,
} from '../guios-core';

export interface FilaFactor {
  idFactor: number;
  nombre: string;
  dimension: string;
  alcanceCatalogo: AlcanceCatalogo;
  /** Alcance efectivo con el que se evalúa el factor (RN-04). */
  alcance: Alcance;
  totalSubfactores: number;
  ie: Importancia;
  il: Importancia;
  /** Importancia sugerida vigente para esta evaluación. */
  is: Importancia;
  /** Importancia del decisor; `null` si aún no la asignó. */
  id: Importancia | null;
  ir: Importancia | null;
  relevante: boolean;
  estado: EstadoFactor | 'sin_valorar';
  pm: number | null;
  foda: Foda | null;
}

export interface ResumenFactores {
  /** Factores con importancia asignada por el decisor. */
  valorados: number;
  /** Factores con IR > 1. */
  relevantes: number;
  total: number;
}

/**
 * Deriva un factor. `alcanceElegido` es la elección del decisor sobre el alcance de un
 * factor «Ambos» cuando todavía no hay valoración guardada (solo se persiste junto con la ID).
 */
export function derivarFactor(
  factor: FactorCatalogo,
  calculo: CalculoImportancia,
  valoracion: ValoracionFactor | undefined,
  alcanceElegido?: Alcance,
  dimension = '',
): FilaFactor {
  const sugerida = calculo.porFactor[factor.id];
  if (!sugerida) {
    throw new Error(`El cálculo de importancia sugerida no incluye el factor «${factor.nombre}».`);
  }
  const alcance = alcanceEfectivo(factor.alcance, valoracion?.alcance ?? alcanceElegido);
  const base = {
    idFactor: factor.id,
    nombre: factor.nombre,
    dimension,
    alcanceCatalogo: factor.alcance,
    alcance,
    totalSubfactores: factor.idsSubfactores.length,
    ie: sugerida.ie,
    il: sugerida.il,
    is: sugerida.is,
  };
  if (!valoracion) {
    return {
      ...base,
      id: null,
      ir: null,
      relevante: false,
      estado: 'sin_valorar',
      pm: null,
      foda: null,
    };
  }
  const resultado = evaluarFactor({
    nombre: factor.nombre,
    alcance,
    is: sugerida.is,
    id: valoracion.id,
    ps: factor.idsSubfactores.map((idSubfactor) => valoracion.cumplimientos[idSubfactor] ?? null),
  });
  return {
    ...base,
    id: valoracion.id,
    ir: resultado.ir,
    relevante: resultado.relevante,
    estado: resultado.estado,
    pm: resultado.pm,
    foda: resultado.foda,
  };
}

/** Deriva todos los factores del catálogo, dimensión por dimensión y en su orden. */
export function derivarFactores(
  catalogo: Catalogo,
  calculo: CalculoImportancia,
  valoraciones: readonly ValoracionFactor[],
  alcanceElegidoPorFactor: Readonly<Record<number, Alcance>> = {},
): FilaFactor[] {
  const porFactor = new Map(valoraciones.map((v) => [v.idFactor, v]));
  return catalogo.dimensiones.flatMap((dimension) =>
    dimension.factores.map((factor) =>
      derivarFactor(
        factor,
        calculo,
        porFactor.get(factor.id),
        alcanceElegidoPorFactor[factor.id],
        dimension.nombre,
      ),
    ),
  );
}

export function resumirFactores(filas: readonly FilaFactor[]): ResumenFactores {
  return {
    valorados: filas.filter((f) => f.id !== null).length,
    relevantes: filas.filter((f) => f.relevante).length,
    total: filas.length,
  };
}

/** Datos a guardar de un factor: la entrada del decisor y su fotografía derivada. */
export function filaParaGuardar(fila: FilaFactor): FilaValoracionFactor {
  if (fila.id === null || fila.ir === null) {
    throw new Error(`El factor «${fila.nombre}» está sin valorar: no hay nada que guardar.`);
  }
  return {
    idFactor: fila.idFactor,
    id: fila.id,
    alcance: fila.alcance,
    ir: fila.ir,
    relevante: fila.relevante,
    pm: fila.pm,
    foda: fila.foda,
  };
}

/** Ayuda de la IS (BRIEF §12.2): de dónde sale (IE, IL y cálculo vigente). */
export function textoAyudaImportanciaSugerida(fila: FilaFactor, nombreCalculo: string): string {
  return (
    `Importancia sugerida = intersección de la importancia del experto (IE = ${fila.ie}) ` +
    `y la de la literatura (IL = ${fila.il}). Fuente: ${nombreCalculo}.`
  );
}

/** Recomendación lista para mostrar: código, título y texto de la tesis (§4.4) y sus causas. */
export interface RecomendacionVista {
  codigo: CodigoRecomendacion;
  titulo: string;
  texto: string;
  causas: readonly CausaRecomendacion[];
}

/** Resultados de P-06: los factores por situación y la recomendación de `guios-core` (RN-08). */
export interface ResultadosEvaluacion {
  /** Factores con todos sus subfactores valorados (los únicos que cuentan, RN-08). */
  evaluados: readonly FilaFactor[];
  /** Relevantes con algún subfactor sin valorar: se excluyen de la recomendación. */
  pendientes: readonly FilaFactor[];
  /** Con importancia relativa 1: no se valoran. */
  excluidos: readonly FilaFactor[];
  /** `null` si ningún factor está evaluado. */
  recomendacion: RecomendacionVista | null;
}

/** Arma una recomendación para mostrar a partir de su código, causas y (si se guardó) su texto. */
export function vistaDeRecomendacion(
  codigo: CodigoRecomendacion,
  causas: readonly CausaRecomendacion[],
  texto: string = TEXTOS_RECOMENDACION[codigo].texto,
): RecomendacionVista {
  return { codigo, titulo: TEXTOS_RECOMENDACION[codigo].titulo, texto, causas };
}

/** Clasifica los factores y emite la recomendación con `guios-core`: sin reglas propias. */
export function derivarResultados(filas: readonly FilaFactor[]): ResultadosEvaluacion {
  const evaluados = filas.filter((f) => f.estado === 'evaluado');
  const resultado = recomendar(
    evaluados.flatMap((f) => (f.ir === null ? [] : [{ nombre: f.nombre, ir: f.ir, foda: f.foda }])),
  );
  return {
    evaluados,
    pendientes: filas.filter((f) => f.estado === 'pendiente'),
    excluidos: filas.filter((f) => f.estado === 'no_relevante'),
    recomendacion: resultado && vistaDeRecomendacion(resultado.codigo, resultado.causas),
  };
}

/** Fotografía de los factores con importancia asignada, para guardar al finalizar. */
export const filasParaFinalizar = (filas: readonly FilaFactor[]): FilaValoracionFactor[] =>
  filas.filter((f) => f.id !== null).map(filaParaGuardar);

/** Recomendación a guardar al finalizar; `null` si no hay factores evaluados. */
export function recomendacionParaGuardar(
  resultados: ResultadosEvaluacion,
): RecomendacionGuardada | null {
  const { recomendacion } = resultados;
  if (!recomendacion) return null;
  return { codigo: recomendacion.codigo, texto: recomendacion.texto, causas: recomendacion.causas };
}

export interface SubfactorDetalle {
  id: number;
  enunciado: string;
  /** Cumplimiento valorado; `null` si falta. */
  ps: Cumplimiento | null;
}

export interface DetalleSubfactores {
  subfactores: SubfactorDetalle[];
  valorados: number;
  total: number;
  /** PM de los subfactores ya valorados: vista previa en vivo, sin FODA mientras falten (RN-06). */
  pmParcial: number | null;
}

/** Subfactores de un factor con su PS y la PM en vivo de P-05 (la PM la calcula `guios-core`). */
export function detalleSubfactores(
  factor: FactorCatalogo,
  enunciados: Readonly<Record<number, string>>,
  valoracion: ValoracionFactor | undefined,
): DetalleSubfactores {
  const subfactores = factor.idsSubfactores.map((id) => ({
    id,
    enunciado: enunciados[id] ?? `Subfactor ${id}`,
    ps: valoracion?.cumplimientos[id] ?? null,
  }));
  const valorados = subfactores.flatMap((s) => (s.ps === null ? [] : [s.ps]));
  return {
    subfactores,
    valorados: valorados.length,
    total: subfactores.length,
    pmParcial: ponderacionMedia(valorados),
  };
}

/** Lo guardado al finalizar manda sobre lo que se derivaría hoy (fotografía, BRIEF §5.9). */
export function recomendacionAMostrar(
  evaluacion: Pick<EvaluacionDetalle, 'estado' | 'recomendacion'>,
  derivada: RecomendacionVista | null,
): RecomendacionVista | null {
  const { recomendacion } = evaluacion;
  if (evaluacion.estado === 'finalizada' && recomendacion) {
    return vistaDeRecomendacion(recomendacion.codigo, recomendacion.causas, recomendacion.texto);
  }
  return derivada;
}
