/**
 * Qué clasificador usará de verdad el recálculo, según lo guardado en la app (issue #37).
 * El navegador no puede leer los secretos de Supabase: cuando algo no está definido aquí lo dice
 * con el valor por defecto de la Edge Function (`supabase/functions/_shared/configuracion.ts`) y
 * avisa de que un secreto puede cambiarlo.
 */
import type { ConfiguracionRecalculo } from './tipos';

export const MODELO_POR_DEFECTO = 'gemini-3.1-flash-lite';
export const UMBRAL_POR_DEFECTO = 0.7;
export const MAX_CANDIDATOS_POR_DEFECTO = 50;

export interface ResumenClasificador {
  /** `secreto`: el proveedor lo decide LLM_PROVIDER, que la app no puede ver. */
  proveedor: 'gemini' | 'fake' | 'secreto';
  /** Línea principal: proveedor, modelo, valores y estado de la clave. */
  principal: string;
  /** Advertencias y recomendaciones, una por línea. */
  avisos: string[];
  /** `true` si el resumen lleva un problema probable (falta la clave de Gemini). */
  conProblema: boolean;
}

const formatoDecimal = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 3 });

const NOTA_POR_DEFECTO =
  'Un valor «por defecto» puede cambiarse con un secreto de Supabase (LLM_MODEL, LLM_UMBRAL, RECALCULO_MAX_CANDIDATOS).';

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

  const usaDefecto = [
    parametros.modelo === null,
    parametros.umbral === null,
    parametros.maxCandidatos === null,
  ];
  const detalles = [
    `modelo ${parametros.modelo ?? MODELO_POR_DEFECTO}${parametros.modelo === null ? ' (por defecto)' : ''}`,
    `umbral ${formatoDecimal.format(parametros.umbral ?? UMBRAL_POR_DEFECTO)}${parametros.umbral === null ? ' (por defecto)' : ''}`,
    `máx. ${parametros.maxCandidatos ?? MAX_CANDIDATOS_POR_DEFECTO} candidatos${parametros.maxCandidatos === null ? ' (por defecto)' : ''}`,
  ];
  const avisos = usaDefecto.some(Boolean) ? [NOTA_POR_DEFECTO] : [];

  if (parametros.proveedorLlm === null) {
    return {
      proveedor: 'secreto',
      principal: `Proveedor: lo decide el secreto LLM_PROVIDER de Supabase, que la app no puede ver · ${detalles.slice(1).join(' · ')}`,
      avisos: [
        'Para saber con certeza qué se usa, elige Gemini o Falso (demostración) en la configuración.',
        ...avisos,
      ],
      conProblema: false,
    };
  }

  const claveGuardada = claves.some((c) => c.nombre === 'GEMINI_API_KEY' && c.configurada);
  return {
    proveedor: 'gemini',
    principal: `Gemini · ${detalles.join(' · ')} · ${
      claveGuardada ? 'clave guardada en la app' : 'clave no guardada en la app'
    }`,
    avisos: claveGuardada
      ? avisos
      : [
          'Esta clave no está guardada aquí: el recálculo usará GEMINI_API_KEY de los secretos de Supabase si existe; si no, el recálculo fallará.',
          ...avisos,
        ],
    conProblema: !claveGuardada,
  };
}
