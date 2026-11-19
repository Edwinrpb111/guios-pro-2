/**
 * Validación del formulario «Configuración del recálculo» (issue #33). Son las mismas reglas que
 * imponen la base (CHECK de `configuracion_recalculo`) y la Edge Function (`configuracion.ts`):
 * umbral entre 0 y 1, máximo de candidatos entero entre 1 y 200, llamadas por minuto a la IA
 * entero entre 1 y 1000, llamadas simultáneas a la IA entero entre 1 y 10 (issue #45) y, para el proveedor compatible con OpenAI (issue #40), una dirección base
 * https limpia y un modelo de hasta 150 caracteres. Un campo vacío = `null`, es decir, «usar el
 * secreto de Supabase o el valor por defecto».
 */
import type { ParametrosRecalculo, ProveedorLlm } from './tipos';

export const MAX_CANDIDATOS_TOPE = 200;
export const LLAMADAS_POR_MINUTO_TOPE = 1000;
/** Tandas de un paso que se mandan a la IA a la vez (issue #45); CHECK 1..10 en la base. */
export const LLAMADAS_SIMULTANEAS_TOPE = 10;
export const LARGO_MAXIMO_MODELO = 100;
/** El modelo va en la URL de Gemini: mismo patrón que el CHECK de la base. */
const MODELO_VALIDO = /^[A-Za-z0-9._-]+$/;
export const LARGO_MAXIMO_CLAVE = 1000;
export const LARGO_MAXIMO_MODELO_OPENAI = 150;
export const LARGO_MAXIMO_URL_BASE = 200;
/** OpenRouter y otros usan «/» y «:» en el modelo; va en el cuerpo JSON, no en la URL. */
const MODELO_OPENAI_VALIDO = /^[A-Za-z0-9._:/@-]+$/;
/** https://servidor[:puerto][/ruta]: mismo patrón que el CHECK de `openai_base_url`. */
const URL_BASE_VALIDA = /^https:\/\/[^/?#@\\\s]+(\/[^?#\\\s]*)?$/;

export interface FormularioConfiguracion {
  proveedorLlm: string;
  modelo: string;
  umbral: string;
  maxCandidatos: string;
  llamadasPorMinuto: string;
  llamadasSimultaneas: string;
  /** Casilla «Desactivar razonamiento del modelo» (issue #45). */
  desactivarRazonamiento: boolean;
  crossrefMailto: string;
  openaiBaseUrl: string;
  openaiModelo: string;
}

export type ValidacionConfiguracion =
  { parametros: ParametrosRecalculo; error?: never } | { error: string; parametros?: never };

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function formularioDesdeParametros(p: ParametrosRecalculo): FormularioConfiguracion {
  return {
    proveedorLlm: p.proveedorLlm ?? '',
    modelo: p.modelo ?? '',
    umbral: p.umbral === null ? '' : String(p.umbral),
    maxCandidatos: p.maxCandidatos === null ? '' : String(p.maxCandidatos),
    llamadasPorMinuto: p.llamadasPorMinuto === null ? '' : String(p.llamadasPorMinuto),
    llamadasSimultaneas: p.llamadasSimultaneas === null ? '' : String(p.llamadasSimultaneas),
    desactivarRazonamiento: p.desactivarRazonamiento === true,
    crossrefMailto: p.crossrefMailto ?? '',
    openaiBaseUrl: p.openaiBaseUrl ?? '',
    openaiModelo: p.openaiModelo ?? '',
  };
}

/**
 * Dirección base normalizada (sin espacios ni «/» final) o el motivo del rechazo. Los mensajes no
 * repiten la dirección escrita: podría llevar un usuario y una clave.
 */
function validarUrlBase(texto: string): { url: string; error?: never } | { error: string } {
  const url = texto.trim();
  if (url.length > LARGO_MAXIMO_URL_BASE) {
    return { error: `La dirección base no puede superar ${LARGO_MAXIMO_URL_BASE} caracteres.` };
  }
  if (!/^https:\/\//i.test(url)) {
    return {
      error:
        'La dirección base debe empezar con https:// (por ejemplo, https://openrouter.ai/api/v1).',
    };
  }
  if (url.includes('@')) {
    return {
      error: 'La dirección base no puede llevar usuario ni clave: la clave se guarda aparte.',
    };
  }
  if (url.includes('?')) {
    return { error: 'La dirección base no puede llevar parámetros de consulta (?…).' };
  }
  if (url.includes('#')) {
    return { error: 'La dirección base no puede llevar un fragmento (#…).' };
  }
  let valida = URL_BASE_VALIDA.test(url);
  if (valida) {
    try {
      const interpretada = new URL(url);
      valida = interpretada.protocol === 'https:' && interpretada.hostname !== '';
    } catch {
      valida = false;
    }
  }
  if (!valida) {
    return {
      error:
        'La dirección base no es válida: usa https://servidor/ruta, sin espacios (por ejemplo, https://api.groq.com/openai/v1).',
    };
  }
  return { url: url.replace(/\/+$/, '') };
}

export function validarConfiguracion(f: FormularioConfiguracion): ValidacionConfiguracion {
  const proveedor = f.proveedorLlm.trim();
  if (
    proveedor !== '' &&
    proveedor !== 'gemini' &&
    proveedor !== 'openai' &&
    proveedor !== 'fake'
  ) {
    return {
      error:
        'El proveedor del clasificador debe ser Gemini, uno compatible con OpenAI o el falso de demostración.',
    };
  }

  const modelo = f.modelo.trim();
  if (modelo.length > LARGO_MAXIMO_MODELO) {
    return { error: `El modelo no puede superar ${LARGO_MAXIMO_MODELO} caracteres.` };
  }
  if (modelo !== '' && !MODELO_VALIDO.test(modelo)) {
    return {
      error:
        'El modelo solo admite letras, dígitos, punto, guion y guion bajo (por ejemplo, gemini-3.1-flash-lite).',
    };
  }

  const textoUmbral = f.umbral.trim().replace(',', '.');
  const umbral = textoUmbral === '' ? null : Number(textoUmbral);
  if (umbral !== null && !(umbral >= 0 && umbral <= 1)) {
    return { error: 'El umbral de confianza debe ser un número entre 0 y 1 (por ejemplo, 0,7).' };
  }

  const textoMaximo = f.maxCandidatos.trim();
  const maximo = textoMaximo === '' ? null : Number(textoMaximo);
  if (
    maximo !== null &&
    (!/^\d+$/.test(textoMaximo) || maximo < 1 || maximo > MAX_CANDIDATOS_TOPE)
  ) {
    return {
      error: `El máximo de candidatos debe ser un entero entre 1 y ${MAX_CANDIDATOS_TOPE}.`,
    };
  }

  const textoRitmo = f.llamadasPorMinuto.trim();
  const ritmo = textoRitmo === '' ? null : Number(textoRitmo);
  if (
    ritmo !== null &&
    (!/^\d+$/.test(textoRitmo) || ritmo < 1 || ritmo > LLAMADAS_POR_MINUTO_TOPE)
  ) {
    return {
      error: `Las llamadas por minuto a la IA deben ser un entero entre 1 y ${LLAMADAS_POR_MINUTO_TOPE}.`,
    };
  }

  const textoSimultaneas = f.llamadasSimultaneas.trim();
  const simultaneas = textoSimultaneas === '' ? null : Number(textoSimultaneas);
  if (
    simultaneas !== null &&
    (!/^\d+$/.test(textoSimultaneas) || simultaneas < 1 || simultaneas > LLAMADAS_SIMULTANEAS_TOPE)
  ) {
    return {
      error: `Las llamadas simultáneas a la IA deben ser un entero entre 1 y ${LLAMADAS_SIMULTANEAS_TOPE}.`,
    };
  }

  const textoUrl = f.openaiBaseUrl.trim();
  let openaiBaseUrl: string | null = null;
  if (textoUrl !== '') {
    const url = validarUrlBase(textoUrl);
    if (url.error !== undefined) return { error: url.error };
    openaiBaseUrl = url.url;
  }

  const openaiModelo = f.openaiModelo.trim();
  if (openaiModelo.length > LARGO_MAXIMO_MODELO_OPENAI) {
    return {
      error: `El modelo del proveedor compatible no puede superar ${LARGO_MAXIMO_MODELO_OPENAI} caracteres.`,
    };
  }
  if (openaiModelo !== '' && !MODELO_OPENAI_VALIDO.test(openaiModelo)) {
    return {
      error:
        'El modelo del proveedor compatible solo admite letras, dígitos, punto, guion, guion bajo, «:», «/» y «@» (por ejemplo, meta-llama/llama-3.3-70b-instruct:free).',
    };
  }

  const correo = f.crossrefMailto.trim();
  if (correo !== '' && (correo.length > 254 || !CORREO.test(correo))) {
    return { error: 'El correo para Crossref no es válido.' };
  }

  return {
    parametros: {
      proveedorLlm: proveedor === '' ? null : (proveedor as ProveedorLlm),
      modelo: modelo === '' ? null : modelo,
      umbral,
      maxCandidatos: maximo,
      llamadasPorMinuto: ritmo,
      llamadasSimultaneas: simultaneas,
      // Sin marcar = «no definido»: se usa LLM_DESACTIVAR_RAZONAMIENTO o, si no existe, false.
      desactivarRazonamiento: f.desactivarRazonamiento ? true : null,
      crossrefMailto: correo === '' ? null : correo,
      openaiBaseUrl,
      openaiModelo: openaiModelo === '' ? null : openaiModelo,
    },
  };
}

/** Una clave se guarda sin espacios alrededor; no puede estar vacía. */
export function validarClave(texto: string): { valor: string; error?: never } | { error: string } {
  const valor = texto.trim();
  if (valor === '') return { error: 'Escribe la clave antes de guardarla.' };
  if (valor.length > LARGO_MAXIMO_CLAVE) {
    return { error: `La clave no puede superar ${LARGO_MAXIMO_CLAVE} caracteres.` };
  }
  return { valor };
}
