/**
 * Conversión de las filas de Supabase al modelo de `tipos.ts`. Son funciones puras:
 * validan los dominios cerrados (escalas 1..4, alcances, estados) y fallan con un
 * mensaje claro si la base devolviera algo fuera de ellos (BRIEF §14).
 */
import { esCumplimiento, esImportancia } from '../guios-core';
import type { Alcance, AlcanceCatalogo, Cumplimiento, Importancia } from '../guios-core';
import type {
  CalculoImportancia,
  CalculoResumen,
  Catalogo,
  CodigoRecomendacion,
  Contexto,
  EstadoEvaluacion,
  EvaluacionDetalle,
  ImportanciaSugerida,
  ResumenEvaluacion,
  ValoracionFactor,
} from './tipos';

// --- Forma de las filas que devuelven las consultas del repositorio ---------------------------

export interface FilaCatalogo {
  id_dimension: number;
  nombre: string;
  factor: {
    id_factor: number;
    nombre: string;
    alcance: string;
    orden: number;
    subfactor: { id_subfactor: number; orden: number }[];
  }[];
}

export interface FilaCalculo {
  id_calculo: number;
  origen: string;
  anio_inicio: number | null;
  anio_fin: number | null;
  etiqueta_rango: string | null;
  bases_datos: string | null;
  fecha_calculo: string;
  sugerida_factor?: {
    id_factor: number;
    importancia_experto: number;
    importancia_literatura: number;
    importancia_sugerida: number;
  }[];
}

export interface FilaResumenEvaluacion {
  id_evaluacion: number;
  titulo: string | null;
  estado: string;
  codigo_recomendacion: string | null;
  fecha_actualizacion: string;
  software_evaluado: {
    nombre: string;
    version: string | null;
    tipo_licencia: string | null;
    organizacion: { nombre: string } | null;
  } | null;
  valoracion_factor: {
    id_factor: number;
    es_relevante: boolean;
    valoracion_subfactor: { id_subfactor: number }[];
  }[];
}

export interface FilaEvaluacion {
  id_evaluacion: number;
  titulo: string | null;
  estado: string;
  id_calculo: number;
  software_evaluado: {
    id_software: number;
    nombre: string;
    version: string | null;
    tipo_licencia: string | null;
    organizacion: {
      id_organizacion: number;
      nombre: string;
      sector: string | null;
      pais: string | null;
    } | null;
  } | null;
  valoracion_factor: {
    id_factor: number;
    importancia_decisor: number;
    alcance_aplicado: string;
    valoracion_subfactor: { id_subfactor: number; nivel_cumplimiento: number }[];
  }[];
}

// --- Validación de dominios cerrados -----------------------------------------------------------

const importancia = (valor: number, que: string): Importancia => {
  if (!esImportancia(valor)) throw new RangeError(`Importancia fuera de 1..4 en ${que}: ${valor}`);
  return valor;
};

const cumplimiento = (valor: number): Cumplimiento => {
  if (!esCumplimiento(valor)) throw new RangeError(`Cumplimiento fuera de 1..4: ${valor}`);
  return valor;
};

const alcanceCatalogo = (valor: string): AlcanceCatalogo => {
  if (valor === 'Interno' || valor === 'Externo' || valor === 'Ambos') return valor;
  throw new RangeError(`Alcance desconocido en el catálogo: ${valor}`);
};

const alcanceAplicado = (valor: string): Alcance => {
  if (valor === 'Interno' || valor === 'Externo') return valor;
  throw new RangeError(`Alcance aplicado desconocido: ${valor}`);
};

const estado = (valor: string): EstadoEvaluacion => {
  if (valor === 'en_curso' || valor === 'finalizada') return valor;
  throw new RangeError(`Estado de evaluación desconocido: ${valor}`);
};

const codigo = (valor: string | null): CodigoRecomendacion | null => {
  if (valor === null || valor === 'A' || valor === 'B' || valor === 'C') return valor;
  throw new RangeError(`Código de recomendación desconocido: ${valor}`);
};

// --- Catálogo y cálculo ------------------------------------------------------------------------

export function mapearCatalogo(filas: readonly FilaCatalogo[]): Catalogo {
  return {
    dimensiones: filas.map((dimension) => ({
      id: dimension.id_dimension,
      nombre: dimension.nombre,
      factores: [...dimension.factor]
        .sort((a, b) => a.orden - b.orden)
        .map((factor) => ({
          id: factor.id_factor,
          nombre: factor.nombre,
          alcance: alcanceCatalogo(factor.alcance),
          orden: factor.orden,
          idsSubfactores: [...factor.subfactor]
            .sort((a, b) => a.orden - b.orden)
            .map((subfactor) => subfactor.id_subfactor),
        })),
    })),
  };
}

/** Texto con que se nombra un cálculo (la tabla no guarda un nombre). */
export function nombreDeCalculo(
  calculo: Pick<FilaCalculo, 'origen' | 'anio_inicio' | 'anio_fin'>,
): string {
  return calculo.origen === 'tesis'
    ? 'Cálculo inicial de la tesis'
    : `Recálculo IA ${calculo.anio_inicio}–${calculo.anio_fin}`;
}

export function mapearCalculo(
  fila: FilaCalculo & { sugerida_factor: NonNullable<FilaCalculo['sugerida_factor']> },
): CalculoImportancia;
export function mapearCalculo(fila: FilaCalculo): CalculoResumen;
export function mapearCalculo(fila: FilaCalculo): CalculoResumen | CalculoImportancia {
  const resumen: CalculoResumen = {
    id: fila.id_calculo,
    nombre: nombreDeCalculo(fila),
    rango: fila.etiqueta_rango ?? `${fila.anio_inicio}–${fila.anio_fin}`,
    fecha: fila.fecha_calculo,
    bases: fila.bases_datos,
  };
  if (!fila.sugerida_factor) return resumen;
  const porFactor: Record<number, ImportanciaSugerida> = {};
  for (const s of fila.sugerida_factor) {
    porFactor[s.id_factor] = {
      ie: importancia(s.importancia_experto, 'IE'),
      il: importancia(s.importancia_literatura, 'IL'),
      is: importancia(s.importancia_sugerida, 'IS'),
    };
  }
  return { ...resumen, porFactor };
}

// --- Evaluaciones ------------------------------------------------------------------------------

export function mapearResumen(fila: FilaResumenEvaluacion): ResumenEvaluacion {
  const software = fila.software_evaluado;
  return {
    id: fila.id_evaluacion,
    titulo: fila.titulo ?? '',
    estado: estado(fila.estado),
    codigo: codigo(fila.codigo_recomendacion),
    fecha: fila.fecha_actualizacion,
    // Un borrador con organización pero sin nombre de software todavía no tiene software.
    software:
      software && software.nombre.trim() !== ''
        ? {
            nombre: software.nombre,
            version: software.version ?? '',
            licencia: software.tipo_licencia ?? '',
          }
        : null,
    organizacion: software?.organizacion?.nombre || null,
    factoresValorados: fila.valoracion_factor.map((v) => ({
      idFactor: v.id_factor,
      relevante: v.es_relevante,
      subfactoresValorados: v.valoracion_subfactor.length,
    })),
  };
}

function mapearContexto(fila: FilaEvaluacion): Contexto {
  const software = fila.software_evaluado;
  const organizacion = software?.organizacion;
  return {
    titulo: fila.titulo ?? '',
    software: {
      id: software?.id_software ?? null,
      nombre: software?.nombre ?? '',
      version: software?.version ?? '',
      licencia: software?.tipo_licencia ?? '',
    },
    organizacion: {
      id: organizacion?.id_organizacion ?? null,
      nombre: organizacion?.nombre ?? '',
      sector: organizacion?.sector ?? '',
      pais: organizacion?.pais ?? '',
    },
  };
}

export function mapearEvaluacion(fila: FilaEvaluacion): EvaluacionDetalle {
  const valoraciones: ValoracionFactor[] = fila.valoracion_factor.map((v) => {
    const cumplimientos: Record<number, Cumplimiento> = {};
    for (const s of v.valoracion_subfactor) {
      cumplimientos[s.id_subfactor] = cumplimiento(s.nivel_cumplimiento);
    }
    return {
      idFactor: v.id_factor,
      id: importancia(v.importancia_decisor, 'la valoración del decisor'),
      alcance: alcanceAplicado(v.alcance_aplicado),
      cumplimientos,
    };
  });
  return {
    id: fila.id_evaluacion,
    estado: estado(fila.estado),
    idCalculo: fila.id_calculo,
    contexto: mapearContexto(fila),
    valoraciones,
  };
}
