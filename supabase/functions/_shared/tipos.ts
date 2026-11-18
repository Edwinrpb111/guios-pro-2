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

export interface Clasificador {
  clasificar(
    factor: string,
    subfactor: string,
    contexto: string,
    candidatos: Candidato[],
  ): Promise<Veredicto[]>;
}
