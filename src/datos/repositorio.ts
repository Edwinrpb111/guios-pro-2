/**
 * Acceso a datos de las pantallas P-02..P-06 (BRIEF §11.1): catálogo con la IS vigente,
 * historial, contexto, valoración de factores y subfactores, finalizar y eliminar. Es la única capa que habla con Supabase;
 * las pantallas y los componentes reciben el modelo de `tipos.ts`. Toda operación queda
 * limitada por RLS (BRIEF §10.3).
 *
 * `crearRepositorio` recibe el cliente para poder probarlo contra Supabase local sin
 * pasar por `src/lib/supabase.ts` (que exige las variables `VITE_`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../lib/database.types';
import type { Cumplimiento } from '../guios-core';
import {
  causasParaGuardar,
  mapearCalculo,
  mapearCatalogo,
  mapearEvaluacion,
  mapearResumen,
  type FilaCalculo,
  type FilaCatalogo,
  type FilaEvaluacion,
  type FilaResumenEvaluacion,
} from './mapeo';
import type {
  CalculoImportancia,
  CalculoResumen,
  Catalogo,
  Contexto,
  EvaluacionDetalle,
  FilaValoracionFactor,
  Finalizacion,
  ResumenEvaluacion,
} from './tipos';

export type ClienteGuios = SupabaseClient<Database>;

const CAMPOS_CALCULO =
  'id_calculo, origen, anio_inicio, anio_fin, etiqueta_rango, bases_datos, fecha_calculo';

function fallar(mensaje: string, causa: unknown): never {
  throw new Error(mensaje, { cause: causa });
}

/** Fila de `valoracion_factor`: entrada del decisor y derivados (BRIEF §11.1). */
const filaFactorBd = (idEvaluacion: number, fila: FilaValoracionFactor) => ({
  id_evaluacion: idEvaluacion,
  id_factor: fila.idFactor,
  importancia_decisor: fila.id,
  alcance_aplicado: fila.alcance,
  importancia_relativa: fila.ir,
  es_relevante: fila.relevante,
  // numeric(3,2): se redondea aquí; el FODA ya viene calculado con la PM exacta (BRIEF §5.7).
  ponderacion_global: fila.pm === null ? null : Math.round(fila.pm * 100) / 100,
  clasificacion_foda: fila.foda,
});

const EN_CONFLICTO_FACTOR = { onConflict: 'id_evaluacion,id_factor' } as const;

/** Texto vacío → `null` (las columnas opcionales no guardan cadenas vacías). */
const textoONulo = (texto: string): string | null => {
  const limpio = texto.trim();
  return limpio === '' ? null : limpio;
};

export function crearRepositorio(cliente: ClienteGuios) {
  async function leerCalculoVigente(): Promise<CalculoResumen | null> {
    const { data, error } = await cliente
      .from('calculo_sugerida')
      .select(CAMPOS_CALCULO)
      .eq('vigente', true)
      .maybeSingle();
    if (error) fallar('No se pudo leer la importancia sugerida vigente.', error);
    return data ? mapearCalculo(data as FilaCalculo) : null;
  }

  return {
    /** Dimensiones, factores y subfactores (ids), en su orden. */
    async leerCatalogo(): Promise<Catalogo> {
      const { data, error } = await cliente
        .from('dimension')
        .select(
          'id_dimension, nombre, factor(id_factor, nombre, alcance, orden, subfactor(id_subfactor, orden, enunciado))',
        )
        .order('id_dimension');
      if (error) fallar('No se pudo leer el catálogo de factores.', error);
      return mapearCatalogo(data as FilaCatalogo[]);
    },

    /** Resumen del cálculo de importancia sugerida vigente, o `null` si no hay. */
    leerCalculoVigente,

    /** Un cálculo con la IE, IL e IS de cada factor (el de la evaluación, no necesariamente el vigente). */
    async leerCalculo(idCalculo: number): Promise<CalculoImportancia> {
      const { data, error } = await cliente
        .from('calculo_sugerida')
        .select(
          `${CAMPOS_CALCULO}, sugerida_factor(id_factor, importancia_experto, importancia_literatura, importancia_sugerida)`,
        )
        .eq('id_calculo', idCalculo)
        .maybeSingle();
      if (error) fallar('No se pudo leer la importancia sugerida de la evaluación.', error);
      if (!data) fallar('No existe el cálculo de importancia sugerida de la evaluación.', null);
      return mapearCalculo(
        data as FilaCalculo & { sugerida_factor: NonNullable<FilaCalculo['sugerida_factor']> },
      );
    },

    /** Evaluaciones propias, la más reciente primero (RLS limita a las del usuario). */
    async listarEvaluaciones(): Promise<ResumenEvaluacion[]> {
      const { data, error } = await cliente
        .from('evaluacion')
        .select(
          'id_evaluacion, titulo, estado, codigo_recomendacion, fecha_actualizacion, ' +
            'software_evaluado(nombre, version, tipo_licencia, organizacion(nombre)), ' +
            'valoracion_factor(id_factor, es_relevante, valoracion_subfactor(id_subfactor))',
        )
        .order('fecha_actualizacion', { ascending: false });
      if (error) fallar('No se pudo leer el historial de evaluaciones.', error);
      return (data as unknown as FilaResumenEvaluacion[]).map(mapearResumen);
    },

    /** Crea un borrador asociado al cálculo vigente y devuelve su id. */
    async crearBorrador(): Promise<number> {
      const vigente = await leerCalculoVigente();
      if (!vigente) {
        fallar('No hay una importancia sugerida vigente: no se puede iniciar la evaluación.', null);
      }
      const { data, error } = await cliente
        .from('evaluacion')
        .insert({ id_calculo: vigente.id })
        .select('id_evaluacion')
        .single();
      if (error) fallar('No se pudo crear la evaluación.', error);
      return data.id_evaluacion;
    },

    /** La evaluación con su contexto y valoraciones; `null` si no existe o no es del usuario. */
    async leerEvaluacion(id: number): Promise<EvaluacionDetalle | null> {
      const { data, error } = await cliente
        .from('evaluacion')
        .select(
          'id_evaluacion, titulo, estado, id_calculo, fecha_actualizacion, ' +
            'codigo_recomendacion, texto_recomendacion, causas, ' +
            'software_evaluado(id_software, nombre, version, tipo_licencia, ' +
            'organizacion(id_organizacion, nombre, sector, pais)), ' +
            'valoracion_factor(id_factor, importancia_decisor, alcance_aplicado, ' +
            'valoracion_subfactor(id_subfactor, nivel_cumplimiento))',
        )
        .eq('id_evaluacion', id)
        .maybeSingle();
      if (error) fallar('No se pudo leer la evaluación.', error);
      return data ? mapearEvaluacion(data as unknown as FilaEvaluacion) : null;
    },

    /**
     * Guarda el contexto (BRIEF §11.1): organización y software se insertan la primera vez
     * y se actualizan después; el título y el software se actualizan en la evaluación.
     * Devuelve el contexto con los ids asignados.
     */
    async guardarContexto(idEvaluacion: number, contexto: Contexto): Promise<Contexto> {
      const { software, organizacion } = contexto;
      const hayOrganizacion =
        organizacion.id !== null ||
        [organizacion.nombre, organizacion.sector, organizacion.pais].some((t) => t.trim() !== '');
      const haySoftware =
        hayOrganizacion ||
        software.id !== null ||
        [software.nombre, software.version, software.licencia].some((t) => t.trim() !== '');

      let idOrganizacion = organizacion.id;
      if (hayOrganizacion) {
        const fila = {
          nombre: organizacion.nombre.trim(),
          sector: textoONulo(organizacion.sector),
          pais: textoONulo(organizacion.pais),
        };
        const resultado =
          idOrganizacion === null
            ? await cliente.from('organizacion').insert(fila).select('id_organizacion').single()
            : await cliente
                .from('organizacion')
                .update(fila)
                .eq('id_organizacion', idOrganizacion)
                .select('id_organizacion')
                .single();
        if (resultado.error) fallar('No se pudo guardar la organización.', resultado.error);
        idOrganizacion = resultado.data.id_organizacion;
      }

      let idSoftware = software.id;
      if (haySoftware) {
        const fila = {
          nombre: software.nombre.trim(),
          version: textoONulo(software.version),
          tipo_licencia: textoONulo(software.licencia),
          id_organizacion: idOrganizacion,
        };
        const resultado =
          idSoftware === null
            ? await cliente.from('software_evaluado').insert(fila).select('id_software').single()
            : await cliente
                .from('software_evaluado')
                .update(fila)
                .eq('id_software', idSoftware)
                .select('id_software')
                .single();
        if (resultado.error) fallar('No se pudo guardar el software.', resultado.error);
        idSoftware = resultado.data.id_software;
      }

      // Una evaluación ajena o finalizada no devuelve filas (RLS): no se pudo guardar.
      const { data, error } = await cliente
        .from('evaluacion')
        .update({ titulo: textoONulo(contexto.titulo), id_software: idSoftware })
        .eq('id_evaluacion', idEvaluacion)
        .select('id_evaluacion');
      if (error || data.length !== 1) {
        fallar(
          'No se pudo guardar el contexto: la evaluación no existe o ya está finalizada.',
          error,
        );
      }
      return {
        titulo: contexto.titulo,
        software: { ...software, id: idSoftware },
        organizacion: { ...organizacion, id: idOrganizacion },
      };
    },

    /** *Upsert* de la valoración de un factor: entrada del decisor y derivados (BRIEF §11.1). */
    async guardarValoracionFactor(idEvaluacion: number, fila: FilaValoracionFactor): Promise<void> {
      const { error } = await cliente
        .from('valoracion_factor')
        .upsert(filaFactorBd(idEvaluacion, fila), EN_CONFLICTO_FACTOR);
      if (error) {
        fallar(
          'No se pudo guardar la valoración del factor: la evaluación no existe o ya está finalizada.',
          error,
        );
      }
    },

    /**
     * Valorar un subfactor (BRIEF §11.1): *upsert* del factor con su PM y FODA recalculados
     * (así se obtiene su fila) y *upsert* del PS del subfactor.
     */
    async guardarValoracionSubfactor(
      idEvaluacion: number,
      factor: FilaValoracionFactor,
      idSubfactor: number,
      ps: Cumplimiento,
    ): Promise<void> {
      const mensaje =
        'No se pudo guardar el subfactor: la evaluación no existe o ya está finalizada.';
      const valoracion = await cliente
        .from('valoracion_factor')
        .upsert(filaFactorBd(idEvaluacion, factor), EN_CONFLICTO_FACTOR)
        .select('id_val_factor')
        .single();
      if (valoracion.error) fallar(mensaje, valoracion.error);
      const { error } = await cliente.from('valoracion_subfactor').upsert(
        {
          id_val_factor: valoracion.data.id_val_factor,
          id_subfactor: idSubfactor,
          nivel_cumplimiento: ps,
        },
        { onConflict: 'id_val_factor,id_subfactor' },
      );
      if (error) fallar(mensaje, error);
    },

    /**
     * Finalizar (BRIEF §11.1): vuelve a guardar la fotografía de los factores y congela la
     * evaluación con la recomendación, su texto y sus causas. Después, RLS impide editarla.
     */
    async finalizarEvaluacion(idEvaluacion: number, finalizacion: Finalizacion): Promise<void> {
      const mensaje = 'No se pudo finalizar: la evaluación no existe o ya está finalizada.';
      if (finalizacion.factores.length > 0) {
        const { error } = await cliente.from('valoracion_factor').upsert(
          finalizacion.factores.map((fila) => filaFactorBd(idEvaluacion, fila)),
          EN_CONFLICTO_FACTOR,
        );
        if (error) fallar(mensaje, error);
      }
      const { recomendacion } = finalizacion;
      const { data, error } = await cliente
        .from('evaluacion')
        .update({
          estado: 'finalizada',
          codigo_recomendacion: recomendacion.codigo,
          texto_recomendacion: recomendacion.texto,
          causas: causasParaGuardar(recomendacion.causas),
        })
        .eq('id_evaluacion', idEvaluacion)
        .eq('estado', 'en_curso')
        .select('id_evaluacion');
      if (error || data.length !== 1) fallar(mensaje, error);
    },

    /**
     * Elimina una evaluación propia en curso (issue #32). Sus valoraciones se borran en cascada.
     * RLS no devuelve filas si es ajena, ya no existe o está finalizada (BRIEF §10.3):
     * entonces falla en lugar de fingir que se eliminó.
     */
    async eliminarEvaluacion(idEvaluacion: number): Promise<void> {
      const { data, error } = await cliente
        .from('evaluacion')
        .delete()
        .eq('id_evaluacion', idEvaluacion)
        .select('id_evaluacion');
      if (error || data.length !== 1) {
        fallar(
          'No se pudo eliminar la evaluación: no existe, ya está finalizada o no es tuya.',
          error,
        );
      }
    },
  };
}

export type Repositorio = ReturnType<typeof crearRepositorio>;
