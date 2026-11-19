/**
 * Qué clasificador usará de verdad el recálculo, según lo guardado en la app (issue #37).
 * El navegador no puede leer los secretos de Supabase: cuando algo no está definido aquí lo dice
 * con el valor por defecto de la Edge Function (`supabase/functions/_shared/configuracion.ts`) y
 * avisa de que un secreto puede cambiarlo.
 */
import type { ConfiguracionRecalculo, NombreClave } from './tipos';

export const MODELO_POR_DEFECTO = 'gemini-3.1-flash-lite';
export const UMBRAL_POR_DEFECTO = 0.7;
export const MAX_CANDIDATOS_POR_DEFECTO = 50;
export const LLAMADAS_POR_MINUTO_POR_DEFECTO = 15;
export const LLAMADAS_SIMULTANEAS_POR_DEFECTO = 5;

export interface ResumenClasificador {
  /** `secreto`: el proveedor lo decide LLM_PROVIDER, que la app no puede ver. */
  proveedor: 'gemini' | 'openai' | 'fake' | 'secreto';
  /** Línea principal: proveedor, modelo, valores y estado de la clave. */
  principal: string;
  /** Advertencias y recomendaciones, una por línea. */
  avisos: string[];
  /** `true` si el resumen lleva un problema probable (falta la clave del proveedor). */
  conProblema: boolean;
}

const formatoDecimal = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 3 });

const NOTA_POR_DEFECTO =
  'Un valor «por defecto» puede cambiarse con un secreto de Supabase (LLM_MODEL, LLM_UMBRAL, RECALCULO_MAX_CANDIDATOS, LLM_LLAMADAS_POR_MINUTO, LLM_LLAMADAS_SIMULTANEAS).';
// Con el proveedor compatible el modelo no tiene valor por defecto (es OPENAI_COMPAT_MODEL).
const NOTA_POR_DEFECTO_OPENAI =
  'Un valor «por defecto» puede cambiarse con un secreto de Supabase (LLM_UMBRAL, RECALCULO_MAX_CANDIDATOS, LLM_LLAMADAS_POR_MINUTO, LLM_LLAMADAS_SIMULTANEAS).';

/** Servidor de una dirección base guardada; si no se puede leer, se muestra tal cual. */
function servidorDe(direccion: string): string {
  try {
    return new URL(direccion).host;
  } catch {
    return direccion;
  }
}

const claveGuardada = (claves: ConfiguracionRecalculo['claves'], nombre: NombreClave) =>
  claves.some((c) => c.nombre === nombre && c.configurada);

export function resumirClasificador({
  parametros,
  claves,
}: Pick<ConfiguracionRecalculo, 'parametros' | 'claves'>): ResumenClasificador {
  if (parametros.proveedorLlm === 'fake') {
    return {
      proveedor: 'fake',
      principal: 'Clasificador falso (demostración, sin red ni claves)',
      avisos: [],
      conProblema: false,
    };
  }

  const llamadas = parametros.llamadasPorMinuto ?? LLAMADAS_POR_MINUTO_POR_DEFECTO;
  const detalleUmbral = `umbral ${formatoDecimal.format(parametros.umbral ?? UMBRAL_POR_DEFECTO)}${parametros.umbral === null ? ' (por defecto)' : ''}`;
  const detalleMaximo = `máx. ${parametros.maxCandidatos ?? MAX_CANDIDATOS_POR_DEFECTO} candidatos${parametros.maxCandidatos === null ? ' (por defecto)' : ''}`;
  const detalleRitmo = `${llamadas} ${llamadas === 1 ? 'llamada' : 'llamadas'} por minuto${parametros.llamadasPorMinuto === null ? ' (por defecto)' : ''}`;
  const simultaneas = parametros.llamadasSimultaneas ?? LLAMADAS_SIMULTANEAS_POR_DEFECTO;
  const detalleSimultaneas = `${simultaneas} ${simultaneas === 1 ? 'llamada simultánea' : 'llamadas simultáneas'}${parametros.llamadasSimultaneas === null ? ' (por defecto)' : ''}`;
  // Solo se nombra cuando está activado: sin marcar no se envía nada especial al proveedor.
  const detalleRazonamiento =
    parametros.desactivarRazonamiento === true ? ['razonamiento desactivado'] : [];

  if (parametros.proveedorLlm === 'openai') {
    return resumirCompatible({
      parametros,
      claves,
      detalles: [
        detalleUmbral,
        detalleMaximo,
        detalleRitmo,
        detalleSimultaneas,
        ...detalleRazonamiento,
      ],
      usaDefecto: [
        parametros.umbral === null,
        parametros.maxCandidatos === null,
        parametros.llamadasPorMinuto === null,
        parametros.llamadasSimultaneas === null,
      ].some(Boolean),
    });
  }

  const usaDefecto = [
    parametros.modelo === null,
    parametros.umbral === null,
    parametros.maxCandidatos === null,
    parametros.llamadasPorMinuto === null,
    parametros.llamadasSimultaneas === null,
  ];
  const detalles = [
    `modelo ${parametros.modelo ?? MODELO_POR_DEFECTO}${parametros.modelo === null ? ' (por defecto)' : ''}`,
    detalleUmbral,
    detalleMaximo,
    detalleRitmo,
    detalleSimultaneas,
    ...detalleRazonamiento,
  ];
  const avisos = usaDefecto.some(Boolean) ? [NOTA_POR_DEFECTO] : [];

  if (parametros.proveedorLlm === null) {
    return {
      proveedor: 'secreto',
      principal: `Proveedor: lo decide el secreto LLM_PROVIDER de Supabase, que la app no puede ver · ${detalles.slice(1).join(' · ')}`,
      avisos: [
        'Para saber con certeza qué se usa, elige Gemini, Compatible con OpenAI o Falso (demostración) en la configuración.',
        ...avisos,
      ],
      conProblema: false,
    };
  }

  const guardada = claveGuardada(claves, 'GEMINI_API_KEY');
  return {
    proveedor: 'gemini',
    principal: `Gemini · ${detalles.join(' · ')} · ${
      guardada ? 'clave guardada en la app' : 'clave no guardada en la app'
    }`,
    avisos: guardada
      ? avisos
      : [
          'Esta clave no está guardada aquí: el recálculo usará GEMINI_API_KEY de los secretos de Supabase si existe; si no, el recálculo fallará.',
          ...avisos,
        ],
    conProblema: !guardada,
  };
}

/** «Compatible con OpenAI · <modelo> · <servidor> · …» (issue #40). */
function resumirCompatible({
  parametros,
  claves,
  detalles,
  usaDefecto,
}: Pick<ConfiguracionRecalculo, 'parametros' | 'claves'> & {
  detalles: string[];
  usaDefecto: boolean;
}): ResumenClasificador {
  const { openaiModelo, openaiBaseUrl } = parametros;
  const guardada = claveGuardada(claves, 'OPENAI_COMPAT_API_KEY');
  const avisos: string[] = [];
  if (!guardada) {
    avisos.push(
      'Esta clave no está guardada aquí: el recálculo usará OPENAI_COMPAT_API_KEY de los secretos de Supabase si existe; si no, el recálculo fallará.',
    );
  }
  if (openaiModelo === null || openaiBaseUrl === null) {
    avisos.push(
      'La dirección base o el modelo no están guardados aquí: el recálculo usará OPENAI_COMPAT_BASE_URL y OPENAI_COMPAT_MODEL de los secretos de Supabase; si faltan, el recálculo fallará.',
    );
  }
  if (usaDefecto) avisos.push(NOTA_POR_DEFECTO_OPENAI);

  return {
    proveedor: 'openai',
    principal: [
      'Compatible con OpenAI',
      openaiModelo ?? 'modelo del secreto OPENAI_COMPAT_MODEL',
      openaiBaseUrl === null
        ? 'dirección del secreto OPENAI_COMPAT_BASE_URL'
        : servidorDe(openaiBaseUrl),
      ...detalles,
      guardada ? 'clave guardada en la app' : 'clave no guardada en la app',
    ].join(' · '),
    avisos,
    conProblema: !guardada,
  };
}
