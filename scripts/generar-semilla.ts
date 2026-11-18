/**
 * Genera supabase/seed.sql con el catálogo GUIOS y el cálculo de IS de la tesis (BRIEF §10.4).
 *
 * Fuentes: docs/fuentes/guiosad_data.csv (textos de los 61 subfactores) y la Tabla 5.3 de la
 * tesis (BRIEF §4.1), copiada abajo. Las IS salen de la Tabla 5.3, no de factors.csv (trampa 2).
 *
 * Uso: npm run db:semilla
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Dimension = 'Tecnológica' | 'Organizacional' | 'Económica';
type AlcanceCatalogo = 'Interno' | 'Externo' | 'Ambos';

export interface FactorTesis {
  readonly nombre: string;
  readonly dimension: Dimension;
  readonly alcance: AlcanceCatalogo;
  /** Número de subfactores. */
  readonly ns: number;
  /** Total de citas en la tesis. */
  readonly tc: number;
  readonly il: number;
  readonly is: number;
}

const factor = (
  nombre: string,
  dimension: Dimension,
  alcance: AlcanceCatalogo,
  ns: number,
  tc: number,
  il: number,
  is: number,
): FactorTesis => ({ nombre, dimension, alcance, ns, tc, il, is });

/** Tabla 5.3 de la tesis (BRIEF §4.1), en su orden. IE = 3 en todos. */
export const CATALOGO_TESIS: readonly FactorTesis[] = [
  factor('Compatibilidad', 'Tecnológica', 'Externo', 8, 33, 3, 3),
  factor('Personalización', 'Tecnológica', 'Externo', 6, 30, 4, 3),
  factor('Prueba', 'Tecnológica', 'Externo', 1, 4, 3, 3),
  factor('Fiabilidad', 'Tecnológica', 'Externo', 5, 19, 3, 3),
  factor('Reusabilidad', 'Tecnológica', 'Externo', 2, 5, 2, 2),
  factor('Usabilidad', 'Tecnológica', 'Externo', 4, 14, 2, 2),
  factor('Mantenibilidad', 'Tecnológica', 'Externo', 1, 4, 3, 3),
  factor('Portabilidad', 'Tecnológica', 'Externo', 2, 4, 2, 2),
  factor('Documentación', 'Tecnológica', 'Externo', 11, 20, 1, 2),
  factor('Formación', 'Organizacional', 'Interno', 4, 27, 4, 3),
  factor('Tiempo de adopción', 'Organizacional', 'Interno', 2, 2, 1, 2),
  factor('Casos de estudio de adopción FLOSS', 'Organizacional', 'Externo', 1, 1, 1, 2),
  factor('Centralidad de la tecnología de la información', 'Organizacional', 'Interno', 2, 2, 1, 2),
  factor('Apoyo de la alta dirección', 'Organizacional', 'Interno', 1, 5, 4, 3),
  factor('Bloqueo de proveedores', 'Organizacional', 'Externo', 1, 3, 2, 2),
  factor('Soporte', 'Organizacional', 'Ambos', 6, 43, 4, 3),
  factor('Actitud hacia el cambio', 'Organizacional', 'Interno', 2, 3, 1, 2),
  factor('Coste total de propiedad', 'Económica', 'Interno', 2, 24, 4, 3),
];

export const IE_TESIS = 3;

/** Erratas del CSV que se corrigen al cargarlo (BRIEF §4.1). */
const ERRATAS: readonly (readonly [string, string])[] = [
  ['códigofuente', 'código fuente'],
  ['es una sistemas de administración', 'es un sistema de administración'],
];

export interface SubfactorCsv {
  readonly dimension: string;
  readonly factor: string;
  readonly enunciado: string;
}

/** Lee el CSV tabulado (Dimensión, Factor, Subfactor) y corrige las erratas. */
export function leerSubfactores(csv: string): SubfactorCsv[] {
  const lineas = csv.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lineas[0]?.trim() !== 'Dimensión\tFactor\tSubfactor') {
    throw new Error('El CSV no tiene la cabecera "Dimensión, Factor, Subfactor".');
  }
  return lineas.slice(1).flatMap((linea, i) => {
    if (linea.trim() === '') return [];
    const [dimension, factorCsv, enunciado] = linea.split('\t').map((c) => c.trim());
    if (!dimension || !factorCsv || !enunciado) {
      throw new Error(`El CSV tiene una fila incompleta (fila ${i + 2}).`);
    }
    const corregido = ERRATAS.reduce(
      (texto, [mal, bien]) => texto.replaceAll(mal, bien),
      enunciado,
    );
    return [{ dimension, factor: factorCsv, enunciado: corregido }];
  });
}

const literal = (texto: string): string => `'${texto.replaceAll("'", "''")}'`;

/** Valida el CSV contra la Tabla 5.3 y devuelve el contenido de supabase/seed.sql. */
export function generarSemilla(csv: string): string {
  const subfactores = leerSubfactores(csv);
  for (const s of subfactores) {
    if (!CATALOGO_TESIS.some((f) => f.nombre === s.factor && f.dimension === s.dimension)) {
      throw new Error(`El factor "${s.factor}" (${s.dimension}) del CSV no está en la Tabla 5.3.`);
    }
  }
  for (const f of CATALOGO_TESIS) {
    const n = subfactores.filter((s) => s.factor === f.nombre).length;
    if (n !== f.ns) {
      throw new Error(`"${f.nombre}" tiene ${n} subfactores en el CSV y ${f.ns} en la Tabla 5.3.`);
    }
  }

  const dimensiones = [...new Set(CATALOGO_TESIS.map((f) => f.dimension))];
  const filasFactor = CATALOGO_TESIS.map(
    (f, i) => `  (${literal(f.nombre)}, ${literal(f.dimension)}, ${literal(f.alcance)}, ${i + 1})`,
  );
  const filasSubfactor = CATALOGO_TESIS.flatMap((f) =>
    subfactores
      .filter((s) => s.factor === f.nombre)
      .map((s, k) => `  (${literal(f.nombre)}, ${literal(s.enunciado)}, ${k + 1})`),
  );
  const filasSugerida = CATALOGO_TESIS.map(
    (f) =>
      `  (${literal(f.nombre)}, ${f.ns}, ${f.tc}, ${(f.tc / f.ns).toFixed(4)}, ${IE_TESIS}, ${f.il}, ${f.is})`,
  );

  return `-- Generado por scripts/generar-semilla.ts (npm run db:semilla). No editar a mano.
-- Catálogo GUIOS (3 dimensiones, 18 factores, 61 subfactores) y cálculo de IS de la tesis (BRIEF §10.4).

insert into public.dimension (nombre)
values
${dimensiones.map((d) => `  (${literal(d)})`).join(',\n')};

insert into public.factor (id_dimension, nombre, importancia_experto, alcance, orden)
select d.id_dimension, v.nombre, ${IE_TESIS}, v.alcance, v.orden
from (values
${filasFactor.join(',\n')}
) as v (nombre, dimension, alcance, orden)
join public.dimension d on d.nombre = v.dimension;

insert into public.subfactor (id_factor, enunciado, orden)
select f.id_factor, v.enunciado, v.orden
from (values
${filasSubfactor.join(',\n')}
) as v (factor, enunciado, orden)
join public.factor f on f.nombre = v.factor;

insert into public.calculo_sugerida (origen, etiqueta_rango, bases_datos, estado, vigente, progreso)
values ('tesis', 'RSL de la tesis', 'IEEE, ACM, Scopus, WoS', 'publicado', true, 18);

insert into public.sugerida_factor (
  id_calculo, id_factor, num_subfactores, total_citas, razon_citas,
  importancia_experto, importancia_literatura, importancia_sugerida)
select c.id_calculo, f.id_factor, v.ns, v.tc, v.razon, v.ie, v.il, v.isug
from (values
${filasSugerida.join(',\n')}
) as v (factor, ns, tc, razon, ie, il, isug)
join public.factor f on f.nombre = v.factor
cross join (select id_calculo from public.calculo_sugerida where origen = 'tesis') c;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const csv = readFileSync(new URL('../docs/fuentes/guiosad_data.csv', import.meta.url), 'utf8');
  writeFileSync(new URL('../supabase/seed.sql', import.meta.url), generarSemilla(csv));
  console.log('supabase/seed.sql generado.');
}
