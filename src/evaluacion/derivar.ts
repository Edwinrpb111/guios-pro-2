/**
 * Une el catálogo, el cálculo de importancia sugerida y lo valorado por el decisor
 * y deja a `guios-core` toda la lógica del método (RN-02, RN-03, RN-04, RN-06, RN-07):
 * aquí solo se arman sus entradas y se presentan sus resultados.
 */
import type {
  CalculoImportancia,
  Catalogo,
  FactorCatalogo,
  FilaValoracionFactor,
  ValoracionFactor,
} from '../datos/tipos';
import {
  alcanceEfectivo,
  evaluarFactor,
  type Alcance,
  type AlcanceCatalogo,
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
