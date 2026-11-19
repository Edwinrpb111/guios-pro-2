/**
 * Validación del formulario «Configuración del recálculo» (issue #33). Son las mismas reglas que
 * imponen la base (CHECK de `configuracion_recalculo`) y la Edge Function (`configuracion.ts`):
 * umbral entre 0 y 1, máximo de candidatos entero entre 1 y 200 y llamadas por minuto a
 * Gemini entero entre 1 y 1000. Un campo vacío = `null`, es
 * decir, «usar el secreto de Supabase o el valor por defecto».
 */
import type { ParametrosRecalculo, ProveedorLlm } from './tipos';

export const MAX_CANDIDATOS_TOPE = 200;
export const LLAMADAS_POR_MINUTO_TOPE = 1000;
export const LARGO_MAXIMO_MODELO = 100;
/** El modelo va en la URL de Gemini: mismo patrón que el CHECK de la base. */
const MODELO_VALIDO = /^[A-Za-z0-9._-]+$/;
export const LARGO_MAXIMO_CLAVE = 1000;

export interface FormularioConfiguracion {
  proveedorLlm: string;
  modelo: string;
  umbral: string;
  maxCandidatos: string;
  llamadasPorMinuto: string;
  crossrefMailto: string;
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
    crossrefMailto: p.crossrefMailto ?? '',
  };
}

export function validarConfiguracion(f: FormularioConfiguracion): ValidacionConfiguracion {
  const proveedor = f.proveedorLlm.trim();
  if (proveedor !== '' && proveedor !== 'gemini' && proveedor !== 'fake') {
    return { error: 'El proveedor del clasificador debe ser Gemini o el falso de demostración.' };
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
      error: `Las llamadas por minuto a Gemini deben ser un entero entre 1 y ${LLAMADAS_POR_MINUTO_TOPE}.`,
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
      crossrefMailto: correo === '' ? null : correo,
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
