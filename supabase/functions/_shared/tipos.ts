// Contratos de BRIEF §13.4 (RNF-07): la búsqueda y la clasificación se pueden cambiar sin tocar
// el resto del recálculo.

export type NombreBase = 'openalex' | 'crossref';

export const BASES_VALIDAS: readonly NombreBase[] = ['openalex', 'crossref'];

/** Un artículo candidato tal como lo devuelve la API bibliográfica (sin clasificar). */
export interface Candidato {
  titulo: string;
  anio: number | null;
  /** DOI ya normalizado (minúsculas, sin prefijo), o `null` si la fuente no lo trae. */
  doi: string | null;
  resumen: string | null;
  base: NombreBase;
}

export interface ProveedorBusqueda {
  readonly nombre: NombreBase;
  buscar(
    consulta: string,
    anioInicio: number,
    anioFin: number,
    limite: number,
  ): Promise<Candidato[]>;
}

/** Veredicto del clasificador sobre un candidato; `indice` cuenta desde 1 dentro del lote. */
export interface Veredicto {
  indice: number;
  trata_subfactor: boolean;
  confianza: number;
  evidencia: string;
}

/**
 * Lo que el clasificador anota de UNA llamada (un lote) en el objeto que le pasa quien llama
 * (issue #45): así cada tanda tiene sus propios números aunque varias corran a la vez. Los tokens
 * salen del `usage` del proveedor tal como los informa; `null` si no los informa.
 */
export interface MedicionLlamada {
  /** Reintentos (429/503) de esta llamada. */
  reintentos: number;
  tokensEntrada: number | null;
  tokensSalida: number | null;
  tokensRazonamiento: number | null;
}

export interface Clasificador {
  /**
   * Reintentos acumulados por este clasificador en el paso (429/503 reintentados). Es opcional: el
   * falso no reintenta. El registro del paso reparte la diferencia entre lote y lote (issue #43).
   */
  readonly reintentos?: number;
  clasificar(
    factor: string,
    subfactor: string,
    contexto: string,
    candidatos: Candidato[],
    medicion?: MedicionLlamada,
  ): Promise<Veredicto[]>;
}
