// Puente con el entorno de Deno: lo único que lee `Deno.env`. Los puntos de entrada de las
// funciones (`index.ts`) lo usan para armar el servidor.
import { leerOrigenes } from './configuracion.ts';
import { crearDependencias, type Dependencias } from './dependencias.ts';
import type { OpcionesServidor } from './http.ts';
import { crearInfraestructuraSupabase } from './supabase_real.ts';

const leer = (nombre: string): string | undefined => Deno.env.get(nombre);

let dependencias: Dependencias | undefined;

export function opcionesDesdeEntorno(): OpcionesServidor {
  return {
    origenes: leerOrigenes(leer),
    // Se crean en la primera petición: un error de configuración sale como respuesta JSON.
    crear: () => (dependencias ??= crearDependencias(leer, crearInfraestructuraSupabase(leer))),
  };
}
