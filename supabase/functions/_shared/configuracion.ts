// Lectura y validación de la configuración de las Edge Functions (BRIEF §13.7, issue #33).
// Manda lo guardado por el administrador en la base (tabla `configuracion_recalculo` y claves en
// Vault); lo que falta sale de las variables de entorno. `leerConfiguracion` recibe una función en
// lugar de leer `Deno.env`, para poder probarla.
import { ErrorApi } from './errores.ts';

export type ProveedorLlm = 'gemini' | 'fake';

export interface Configuracion {
  proveedorLlm: ProveedorLlm;
  modelo: string;
  umbral: number;
  maxCandidatos: number;
  openalexApiKey: string | undefined;
  crossrefMailto: string | undefined;
  geminiApiKey: string | undefined;
}

const MODELO_POR_DEFECTO = 'gemini-3.1-flash-lite';
const MODELO_VALIDO = /^[A-Za-z0-9._-]{1,100}$/;
const UMBRAL_POR_DEFECTO = 0.7;
const MAX_CANDIDATOS_POR_DEFECTO = 50;
const MAX_CANDIDATOS_TOPE = 200;

function invalida(variable: string, esperado: string): ErrorApi {
  return new ErrorApi(
    500,
    'configuracion_invalida',
    `La variable ${variable} no es válida: ${esperado}. Corrígela en «Configuración del recálculo» o en los secretos de Supabase.`,
  );
}

export function leerConfiguracion(leer: (nombre: string) => string | undefined): Configuracion {
  const valor = (nombre: string): string | undefined => {
    const texto = leer(nombre)?.trim();
    return texto === undefined || texto === '' ? undefined : texto;
  };

  const proveedor = valor('LLM_PROVIDER') ?? 'gemini';
  if (proveedor !== 'gemini' && proveedor !== 'fake') {
    throw invalida('LLM_PROVIDER', 'debe ser «gemini» o «fake»');
  }

  const textoUmbral = valor('LLM_UMBRAL');
  const umbral = textoUmbral === undefined ? UMBRAL_POR_DEFECTO : Number(textoUmbral);
  if (!(umbral >= 0 && umbral <= 1)) {
    throw invalida('LLM_UMBRAL', 'debe ser un número entre 0 y 1');
  }

  const textoMaximo = valor('RECALCULO_MAX_CANDIDATOS');
  const maxCandidatos =
    textoMaximo === undefined ? MAX_CANDIDATOS_POR_DEFECTO : Number(textoMaximo);
  if (
    !Number.isInteger(maxCandidatos) ||
    maxCandidatos < 1 ||
    maxCandidatos > MAX_CANDIDATOS_TOPE
  ) {
    throw invalida(
      'RECALCULO_MAX_CANDIDATOS',
      `debe ser un entero entre 1 y ${MAX_CANDIDATOS_TOPE}`,
    );
  }

  // El modelo va en la ruta de la URL de Gemini: solo letras, dígitos, punto, guion y guion bajo.
  const modelo = valor('LLM_MODEL') ?? MODELO_POR_DEFECTO;
  if (!MODELO_VALIDO.test(modelo)) {
    throw invalida(
      'LLM_MODEL',
      'solo admite letras, dígitos, punto, guion y guion bajo (hasta 100 caracteres)',
    );
  }

  return {
    proveedorLlm: proveedor,
    modelo,
    umbral,
    maxCandidatos,
    openalexApiKey: valor('OPENALEX_API_KEY'),
    crossrefMailto: valor('CROSSREF_MAILTO'),
    geminiApiKey: valor('GEMINI_API_KEY'),
  };
}

const ORIGENES_POR_DEFECTO = ['http://localhost:5173', 'http://127.0.0.1:5173'];

/** Orígenes del frontend que CORS acepta (BRIEF §14), separados por comas en ORIGENES_PERMITIDOS. */
export function leerOrigenes(leer: (nombre: string) => string | undefined): string[] {
  const origenes = (leer('ORIGENES_PERMITIDOS') ?? '')
    .split(',')
    .map((origen) => origen.trim())
    .filter((origen) => origen !== '');
  return origenes.length > 0 ? origenes : ORIGENES_POR_DEFECTO;
}

/**
 * Lo que devuelve la función SQL `configuracion_recalculo_servicio` (solo service_role): los
 * parámetros guardados desde la app y las claves descifradas de Vault. `null` = sin definir.
 */
export interface ConfiguracionGuardada {
  proveedor_llm?: string | null;
  modelo?: string | null;
  umbral?: number | string | null;
  max_candidatos?: number | string | null;
  crossref_mailto?: string | null;
  gemini_api_key?: string | null;
  openalex_api_key?: string | null;
}

/** Campo guardado de cada variable. ORIGENES_PERMITIDOS no está: nunca sale de la base. */
const VARIABLE_DE_CAMPO: Record<string, keyof ConfiguracionGuardada> = {
  LLM_PROVIDER: 'proveedor_llm',
  LLM_MODEL: 'modelo',
  LLM_UMBRAL: 'umbral',
  RECALCULO_MAX_CANDIDATOS: 'max_candidatos',
  CROSSREF_MAILTO: 'crossref_mailto',
  GEMINI_API_KEY: 'gemini_api_key',
  OPENALEX_API_KEY: 'openalex_api_key',
};

/**
 * Lector que da prioridad a la configuración guardada en la base y, si un valor falta (o está
 * vacío), usa la variable de entorno. Las mismas validaciones de `leerConfiguracion` se aplican
 * al resultado, venga de donde venga.
 */
export function combinarConEntorno(
  guardada: ConfiguracionGuardada | null,
  leer: (nombre: string) => string | undefined,
): (nombre: string) => string | undefined {
  return (nombre) => {
    if (nombre === 'ORIGENES_PERMITIDOS') return leer(nombre);
    const campo = Object.hasOwn(VARIABLE_DE_CAMPO, nombre) ? VARIABLE_DE_CAMPO[nombre] : undefined;
    const valor = campo === undefined || guardada === null ? undefined : guardada[campo];
    if (valor === undefined || valor === null || String(valor).trim() === '') return leer(nombre);
    return String(valor);
  };
}
