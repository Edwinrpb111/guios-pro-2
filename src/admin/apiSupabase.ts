/**
 * `ApiAdmin` con Supabase (BRIEF §11): lecturas con RLS de administrador, funciones SQL de
 * §11.2 y Edge Functions de §11.3. Valida los dominios cerrados al leer (BRIEF §14).
 */
import { FunctionsRelayError, type SupabaseClient } from '@supabase/supabase-js';
import { esImportancia, type Importancia } from '../guios-core';
import type { Database, Json } from '../lib/database.types';
import { leerRegistro } from './registro';
import {
  CLAVES,
  ErrorAdmin,
  type ApiAdmin,
  type CalculoResumen,
  type ConfiguracionRecalculo,
  type EstadoCalculo,
  type EstadoPaso,
  type FilaSugerida,
  type NombreClave,
  type ParametrosCalculo,
  type PasoRegistro,
} from './tipos';

export type ClienteAdmin = SupabaseClient<Database>;

const COLUMNAS_CALCULO =
  'id_calculo, origen, anio_inicio, anio_fin, etiqueta_rango, bases_datos, fecha_calculo, ' +
  'vigente, estado, progreso, mensaje_error, parametros';

const ESTADOS: readonly EstadoCalculo[] = [
  'en_proceso',
  'pausado',
  'completado',
  'publicado',
  'descartado',
  'fallido',
];

const ESTADOS_PASO: readonly EstadoPaso[] = ['pendiente', 'hecho', 'error'];

const COLUMNAS_PASO =
  'id_subfactor, estado, candidatos, aceptados, detalle, iniciado_en, duracion_ms, registro, ' +
  'subfactor(enunciado)';

/** PostgREST devuelve como máximo 1000 filas por consulta (`max_rows`). */
const TAMANO_PAGINA = 1000;

const SIN_CONEXION =
  'No se pudo contactar con el servicio de recálculo. Revisa tu conexión e intenta de nuevo.';

/** Corte de la plataforma (504, 546 WORKER_LIMIT, relay): el paso no alcanzó a terminar. */
export const PASO_SIN_TIEMPO =
  'El paso tardó más de lo permitido. Se reintentará; si se repite, sube las llamadas por minuto o inicia un cálculo nuevo con menos candidatos.';

/** Estados con que la plataforma corta una Edge Function por tiempo o por límite de recursos. */
const ESTADOS_DE_CORTE: readonly number[] = [504, 546];

interface FilaCalculo {
  id_calculo: number;
  origen: string;
  anio_inicio: number | null;
  anio_fin: number | null;
  etiqueta_rango: string | null;
  bases_datos: string | null;
  fecha_calculo: string;
  vigente: boolean;
  estado: string;
  progreso: number;
  mensaje_error: string | null;
  parametros: Json | null;
}

function exigir<T>(resultado: { data: T; error: { message: string } | null }): T {
  if (resultado.error !== null) throw new ErrorAdmin(resultado.error.message);
  return resultado.data;
}

function importancia(valor: number, campo: string): Importancia {
  if (!esImportancia(valor)) throw new ErrorAdmin(`Importancia inválida en ${campo}: ${valor}`);
  return valor;
}

function mapearCalculo(fila: FilaCalculo): CalculoResumen {
  if (!ESTADOS.includes(fila.estado as EstadoCalculo)) {
    throw new ErrorAdmin(`El cálculo ${fila.id_calculo} tiene un estado desconocido.`);
  }
  if (fila.origen !== 'tesis' && fila.origen !== 'ia') {
    throw new ErrorAdmin(`El cálculo ${fila.id_calculo} tiene un origen desconocido.`);
  }
  const parametros =
    fila.parametros !== null &&
    typeof fila.parametros === 'object' &&
    !Array.isArray(fila.parametros)
      ? (fila.parametros as ParametrosCalculo)
      : null;
  return {
    id: fila.id_calculo,
    origen: fila.origen,
    anioInicio: fila.anio_inicio,
    anioFin: fila.anio_fin,
    etiquetaRango: fila.etiqueta_rango,
    basesDatos: fila.bases_datos,
    fecha: fila.fecha_calculo,
    vigente: fila.vigente,
    estado: fila.estado as EstadoCalculo,
    progreso: fila.progreso,
    mensajeError: fila.mensaje_error,
    parametros,
  };
}

interface FilaPaso {
  id_subfactor: number;
  estado: string;
  candidatos: number;
  aceptados: number;
  detalle: string | null;
  iniciado_en: string | null;
  duracion_ms: number | null;
  registro: Json | null;
  /** PostgREST devuelve el subfactor embebido como objeto (o lista/null si algo cambia). */
  subfactor: { enunciado?: unknown } | { enunciado?: unknown }[] | null;
}

function nombreDeSubfactor(subfactor: FilaPaso['subfactor']): string | null {
  const fila = Array.isArray(subfactor) ? subfactor[0] : subfactor;
  return typeof fila?.enunciado === 'string' && fila.enunciado !== '' ? fila.enunciado : null;
}

/**
 * Pasos con actividad (empezados o ya con resultado), del más reciente al más antiguo. Los
 * pendientes que nunca empezaron no son registro: son el trabajo que falta.
 */
function mapearPasos(filas: FilaPaso[]): PasoRegistro[] {
  return filas
    .filter((f) => f.iniciado_en !== null || f.estado !== 'pendiente')
    .map((f) => {
      if (!ESTADOS_PASO.includes(f.estado as EstadoPaso)) {
        throw new ErrorAdmin(
          `El paso del subfactor ${f.id_subfactor} tiene un estado desconocido.`,
        );
      }
      return {
        idSubfactor: f.id_subfactor,
        nombre: nombreDeSubfactor(f.subfactor),
        estado: f.estado as EstadoPaso,
        iniciadoEn: f.iniciado_en,
        duracionMs: f.duracion_ms,
        candidatos: f.candidatos,
        aceptados: f.aceptados,
        detalle: f.detalle,
        registro: leerRegistro(f.registro),
      };
    });
}

const SOLO_ADMINISTRADOR =
  'Solo un administrador puede ver o cambiar la configuración del recálculo.';

/** Cambios recientes que muestra la pantalla de configuración. */
const CAMBIOS_RECIENTES = 10;

/**
 * Configuración del recálculo (issue #33). Las claves no se leen nunca: de Vault solo llega su
 * estado (`estado_claves_recalculo`), y la tabla de parámetros no tiene columnas de claves.
 */
async function obtenerConfiguracion(cliente: ClienteAdmin): Promise<ConfiguracionRecalculo> {
  const [fila, estados, cambios] = await Promise.all([
    cliente
      .from('configuracion_recalculo')
      .select(
        'proveedor_llm, modelo, umbral, max_candidatos, llamadas_por_minuto, llamadas_simultaneas, desactivar_razonamiento, crossref_mailto, openai_base_url, openai_modelo, actualizado_en',
      )
      .maybeSingle()
      .then(exigir),
    cliente.rpc('estado_claves_recalculo').then(exigir),
    cliente
      .from('configuracion_recalculo_cambio')
      .select('id_cambio, cambio, realizado_por_nombre, realizado_en')
      .order('realizado_en', { ascending: false })
      .order('id_cambio', { ascending: false })
      .limit(CAMBIOS_RECIENTES)
      .then(exigir),
  ]);
  if (fila === null) throw new ErrorAdmin(SOLO_ADMINISTRADOR);
  if (
    fila.proveedor_llm !== null &&
    fila.proveedor_llm !== 'gemini' &&
    fila.proveedor_llm !== 'openai' &&
    fila.proveedor_llm !== 'fake'
  ) {
    throw new ErrorAdmin('La configuración tiene un proveedor del clasificador desconocido.');
  }
  const nombres = CLAVES.map((c) => c.nombre as string);
  return {
    parametros: {
      proveedorLlm: fila.proveedor_llm,
      modelo: fila.modelo,
      umbral: fila.umbral === null ? null : Number(fila.umbral),
      maxCandidatos: fila.max_candidatos,
      llamadasPorMinuto: fila.llamadas_por_minuto,
      llamadasSimultaneas: fila.llamadas_simultaneas,
      desactivarRazonamiento: fila.desactivar_razonamiento,
      crossrefMailto: fila.crossref_mailto,
      openaiBaseUrl: fila.openai_base_url,
      openaiModelo: fila.openai_modelo,
    },
    actualizadoEn: fila.actualizado_en,
    claves: (estados ?? []).map((e) => {
      if (!nombres.includes(e.nombre)) throw new ErrorAdmin(`Clave desconocida: ${e.nombre}.`);
      return {
        nombre: e.nombre as NombreClave,
        configurada: e.configurada,
        actualizadaEn: e.actualizada_en,
      };
    }),
    cambios: (cambios ?? []).map((c) => ({
      id: c.id_cambio,
      cambio: c.cambio,
      realizadoPor: c.realizado_por_nombre,
      realizadoEn: c.realizado_en,
    })),
  };
}

/**
 * Convierte el error de una Edge Function en un `ErrorAdmin` con su mensaje en español y su clase
 * (`tipo`). Un corte por tiempo (504, 546, relay) no se confunde con una caída de la red.
 */
async function errorDeFuncion(error: unknown): Promise<ErrorAdmin> {
  const contexto = (error as { context?: unknown } | null)?.context;
  if (!(contexto instanceof Response)) {
    // Sin respuesta: la petición no llegó al servidor (FunctionsFetchError).
    return new ErrorAdmin(SIN_CONEXION, null, null, 'red');
  }
  if (error instanceof FunctionsRelayError || ESTADOS_DE_CORTE.includes(contexto.status)) {
    return new ErrorAdmin(PASO_SIN_TIEMPO, null, null, 'tiempo');
  }
  try {
    const cuerpo = (await contexto.json()) as {
      error?: unknown;
      codigo?: unknown;
      estado?: unknown;
    };
    if (typeof cuerpo.error === 'string') {
      return new ErrorAdmin(
        cuerpo.error,
        typeof cuerpo.codigo === 'string' ? cuerpo.codigo : null,
        typeof cuerpo.estado === 'string' ? cuerpo.estado : null,
      );
    }
  } catch {
    // Cuerpo no JSON: se usa el mensaje genérico con el estado HTTP.
  }
  return new ErrorAdmin(
    `El servicio de recálculo respondió con un error (HTTP ${contexto.status}). Intenta de nuevo.`,
  );
}

async function invocar<T>(cliente: ClienteAdmin, funcion: string, cuerpo: object): Promise<T> {
  const { data, error } = await cliente.functions.invoke(funcion, { body: cuerpo });
  if (error) throw await errorDeFuncion(error);
  return data as T;
}

async function rpcSinResultado(
  cliente: ClienteAdmin,
  funcion: 'publicar_calculo' | 'descartar_calculo' | 'pausar_calculo',
  id: number,
): Promise<void> {
  exigir(await cliente.rpc(funcion, { p_id_calculo: id }));
}

export function crearApiAdmin(cliente: ClienteAdmin): ApiAdmin {
  return {
    async listarCalculos() {
      const filas = exigir(
        await cliente
          .from('calculo_sugerida')
          .select(COLUMNAS_CALCULO)
          .order('fecha_calculo', { ascending: false })
          .order('id_calculo', { ascending: false }),
      ) as unknown as FilaCalculo[];
      return filas.map(mapearCalculo);
    },

    async obtenerCalculo(id) {
      const fila = exigir(
        await cliente
          .from('calculo_sugerida')
          .select(COLUMNAS_CALCULO)
          .eq('id_calculo', id)
          .maybeSingle(),
      ) as unknown as FilaCalculo | null;
      return fila === null ? null : mapearCalculo(fila);
    },

    async filasSugeridas(id) {
      const filas = exigir(
        await cliente
          .from('sugerida_factor')
          .select(
            'id_factor, num_subfactores, total_citas, razon_citas, importancia_experto, ' +
              'importancia_literatura, importancia_sugerida',
          )
          .eq('id_calculo', id),
      ) as unknown as Database['public']['Tables']['sugerida_factor']['Row'][];
      return filas.map((f): FilaSugerida => ({
        idFactor: f.id_factor,
        subfactores: f.num_subfactores,
        citas: f.total_citas,
        razon: Number(f.razon_citas),
        ie: importancia(f.importancia_experto, 'importancia_experto'),
        il: importancia(f.importancia_literatura, 'importancia_literatura'),
        is: importancia(f.importancia_sugerida, 'importancia_sugerida'),
      }));
    },

    async catalogo() {
      const filas = exigir(
        await cliente
          .from('factor')
          .select('id_factor, nombre, orden, subfactor(id_subfactor, enunciado, orden)'),
      ) as unknown as {
        id_factor: number;
        nombre: string;
        orden: number;
        subfactor: { id_subfactor: number; enunciado: string; orden: number }[];
      }[];
      return filas
        .map((f) => ({
          id: f.id_factor,
          nombre: f.nombre,
          orden: f.orden,
          subfactores: f.subfactor
            .map((s) => ({ id: s.id_subfactor, enunciado: s.enunciado, orden: s.orden }))
            .sort((a, b) => a.orden - b.orden),
        }))
        .sort((a, b) => a.orden - b.orden);
    },

    async referencias(id) {
      const todas: Awaited<ReturnType<ApiAdmin['referencias']>> = [];
      for (let desde = 0; ; desde += TAMANO_PAGINA) {
        const filas =
          exigir(
            await cliente
              .from('referencia')
              .select('id_referencia, id_subfactor, titulo, anio, doi, base_datos')
              .eq('id_calculo', id)
              .order('id_referencia')
              .range(desde, desde + TAMANO_PAGINA - 1),
          ) ?? [];
        for (const r of filas) {
          todas.push({
            id: r.id_referencia,
            idSubfactor: r.id_subfactor,
            titulo: r.titulo,
            anio: r.anio,
            doi: r.doi,
            base: r.base_datos,
          });
        }
        if (filas.length < TAMANO_PAGINA) return todas;
      }
    },

    async iniciarRecalculo({ anioInicio, anioFin, fuentes }) {
      const respuesta = await invocar<{ id_calculo: number }>(cliente, 'recalculo-iniciar', {
        anio_inicio: anioInicio,
        anio_fin: anioFin,
        fuentes,
      });
      return respuesta.id_calculo;
    },

    pasoRecalculo(id) {
      return invocar(cliente, 'recalculo-paso', { id_calculo: id });
    },

    async registroPasos(id) {
      const filas = exigir(
        await cliente
          .from('recalculo_paso')
          .select(COLUMNAS_PASO)
          .eq('id_calculo', id)
          // Los pasos sin inicio quedan al final; entre iguales, un orden estable.
          .order('iniciado_en', { ascending: false, nullsFirst: false })
          .order('id_subfactor'),
      ) as unknown as FilaPaso[];
      return mapearPasos(filas);
    },

    obtenerConfiguracion: () => obtenerConfiguracion(cliente),

    async guardarParametros(p) {
      // `.select` para saber si la fila se actualizó: con RLS, un no administrador no ve error,
      // solo cero filas. Quién y cuándo los fija un trigger de la base, no el navegador.
      const filas = exigir(
        await cliente
          .from('configuracion_recalculo')
          .update({
            proveedor_llm: p.proveedorLlm,
            modelo: p.modelo,
            umbral: p.umbral,
            max_candidatos: p.maxCandidatos,
            llamadas_por_minuto: p.llamadasPorMinuto,
            llamadas_simultaneas: p.llamadasSimultaneas,
            desactivar_razonamiento: p.desactivarRazonamiento,
            crossref_mailto: p.crossrefMailto,
            openai_base_url: p.openaiBaseUrl,
            openai_modelo: p.openaiModelo,
          })
          .eq('id', true)
          .select('id'),
      );
      if ((filas ?? []).length !== 1) throw new ErrorAdmin(SOLO_ADMINISTRADOR);
    },

    async guardarClave(nombre, valor) {
      exigir(await cliente.rpc('guardar_clave_recalculo', { p_nombre: nombre, p_valor: valor }));
    },

    async borrarClave(nombre) {
      exigir(await cliente.rpc('borrar_clave_recalculo', { p_nombre: nombre }));
    },

    pausar: (id) => rpcSinResultado(cliente, 'pausar_calculo', id),
    publicar: (id) => rpcSinResultado(cliente, 'publicar_calculo', id),
    descartar: (id) => rpcSinResultado(cliente, 'descartar_calculo', id),

    async conteoCitas(id) {
      const filas = exigir(await cliente.rpc('conteo_citas', { p_id_calculo: id })) ?? [];
      return filas.map((f) => ({
        idFactor: f.id_factor,
        subfactores: f.num_subfactores,
        citas: f.total_citas,
      }));
    },

    async guardarResultado(id, filas) {
      exigir(
        await cliente.rpc('guardar_resultado_calculo', {
          p_id_calculo: id,
          p_filas: filas.map((f) => ({
            id_factor: f.idFactor,
            num_subfactores: f.subfactores,
            total_citas: f.citas,
            razon_citas: f.razon,
            importancia_experto: f.ie,
            importancia_literatura: f.il,
            importancia_sugerida: f.is,
          })),
        }),
      );
    },
  };
}
