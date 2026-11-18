// Contexto semántico de los 61 subfactores (BRIEF §13.2, paso 1): `contexto_subfactores.json`,
// versionado y revisado por el equipo.
import type { SubfactorCatalogo } from './repositorio.ts';
import contenido from './contexto_subfactores.json' with { type: 'json' };

export interface ContextoFactor {
  nombre: string;
  terminos: string[];
}

export interface ContextoSubfactor {
  terminos: string[];
  contexto: string;
}

export interface ContextoSubfactores {
  version: string;
  /** Clave: `orden` del factor (1..18). */
  factores: Record<string, ContextoFactor>;
  /** Clave: `<orden del factor>.<orden del subfactor>`, por ejemplo `1.7`. */
  subfactores: Record<string, ContextoSubfactor>;
}

export function claveSubfactor(sub: Pick<SubfactorCatalogo, 'orden_factor' | 'orden'>): string {
  return `${sub.orden_factor}.${sub.orden}`;
}

/** Términos de búsqueda y descripción del subfactor; si falta en el JSON, usa el catálogo. */
export function contextoDe(
  contexto: ContextoSubfactores,
  sub: SubfactorCatalogo,
): { terminosFactor: string[]; terminosSubfactor: string[]; descripcion: string } {
  const delFactor = contexto.factores[String(sub.orden_factor)];
  const delSubfactor = contexto.subfactores[claveSubfactor(sub)];
  return {
    terminosFactor: delFactor?.terminos ?? [sub.nombre_factor],
    terminosSubfactor: delSubfactor?.terminos ?? [sub.enunciado],
    descripcion: delSubfactor?.contexto ?? sub.enunciado,
  };
}

/** El contexto versionado que se despliega con las funciones. */
export function contextoSubfactores(): ContextoSubfactores {
  return contenido;
}
