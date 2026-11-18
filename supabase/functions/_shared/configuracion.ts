// Lectura y validación de las variables de entorno de las Edge Functions (BRIEF §13.7).
// `leerConfiguracion` recibe una función en lugar de leer `Deno.env`, para poder probarla.
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
const UMBRAL_POR_DEFECTO = 0.7;
const MAX_CANDIDATOS_POR_DEFECTO = 50;
const MAX_CANDIDATOS_TOPE = 200;

function invalida(variable: string, esperado: string): ErrorApi {
  return new ErrorApi(
    500,
    'configuracion_invalida',
    `La variable ${variable} no es válida: ${esperado}. Corrígela en los secretos de Supabase.`,
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

  return {
    proveedorLlm: proveedor,
    modelo: valor('LLM_MODEL') ?? MODELO_POR_DEFECTO,
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
