/**
 * Lectura defensiva de `recalculo_paso.registro` (issue #43). El JSON lo escribe una Edge Function
 * pero se trata como no confiable: cada campo se valida y lo que falte o venga mal queda en `null`.
 */
import type { BusquedaRegistro, LoteRegistro, RegistroPaso } from './tipos';

/** Tope de entradas por lista: el panel no debe romperse con un registro desmesurado. */
const MAX_ENTRADAS = 50;
const MAX_TEXTO = 500;

type Objeto = Record<string, unknown>;

function esObjeto(valor: unknown): valor is Objeto {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? valor : null;
}

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio === '' ? null : limpio.slice(0, MAX_TEXTO);
}

function lista<T>(valor: unknown, leer: (entrada: Objeto) => T): T[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter(esObjeto)
    .slice(0, MAX_ENTRADAS)
    .map((entrada) => leer(entrada));
}

function leerBusqueda(e: Objeto): BusquedaRegistro {
  return {
    fuente: texto(e['fuente']),
    ms: numero(e['ms']),
    candidatos: numero(e['candidatos']),
    error: texto(e['error']),
  };
}

function leerLote(e: Objeto): LoteRegistro {
  return {
    n: numero(e['n']),
    tamano: numero(e['tamano']),
    ms: numero(e['ms']),
    reintentos: numero(e['reintentos']),
    resultado: texto(e['resultado']),
    aceptados: numero(e['aceptados']),
  };
}

/** Devuelve el registro validado, o `null` si el valor no es un objeto JSON. */
export function leerRegistro(valor: unknown): RegistroPaso | null {
  if (!esObjeto(valor)) return null;
  return {
    intento: numero(valor['intento']),
    proveedor: texto(valor['proveedor']),
    busqueda: lista(valor['busqueda'], leerBusqueda),
    lotes: lista(valor['lotes'], leerLote),
    aceptados: numero(valor['aceptados']),
    resultado: texto(valor['resultado']),
    mensaje: texto(valor['mensaje']),
  };
}
