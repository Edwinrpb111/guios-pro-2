/** Validación del formulario de P-09, equivalente a la de `recalculo-iniciar`. */
import { FUENTES, type EntradaRecalculo, type FuenteBibliografica } from './tipos';

export const ANIO_MINIMO = 1900;
export const ANIO_MAXIMO = 2100;

export interface FormularioRecalculo {
  anioInicio: string;
  anioFin: string;
  fuentes: readonly string[];
}

export type Validacion = { entrada: EntradaRecalculo; error?: never } | { error: string };

function leerAnio(texto: string): number | null {
  if (!/^\d{4}$/.test(texto.trim())) return null;
  const anio = Number(texto);
  return anio >= ANIO_MINIMO && anio <= ANIO_MAXIMO ? anio : null;
}

export function validarNuevoRecalculo(formulario: FormularioRecalculo): Validacion {
  const anioInicio = leerAnio(formulario.anioInicio);
  const anioFin = leerAnio(formulario.anioFin);
  if (anioInicio === null || anioFin === null) {
    return { error: `Cada año debe ser un número entre ${ANIO_MINIMO} y ${ANIO_MAXIMO}.` };
  }
  if (anioInicio > anioFin) return { error: 'El año «Desde» no puede ser mayor que «Hasta».' };

  const conocidas = FUENTES.map((f) => f.id as string);
  const fuentes = formulario.fuentes.filter((f) => conocidas.includes(f));
  if (fuentes.length === 0 || fuentes.length !== formulario.fuentes.length) {
    return { error: 'Elige al menos una fuente bibliográfica disponible.' };
  }
  return { entrada: { anioInicio, anioFin, fuentes: fuentes as FuenteBibliografica[] } };
}
