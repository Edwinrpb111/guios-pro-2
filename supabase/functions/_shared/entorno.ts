// Puente con el entorno de Deno: lo único que lee `Deno.env`. Los puntos de entrada de las
// funciones (`index.ts`) lo usan para armar el servidor.
import { leerOrigenes } from './configuracion.ts';
import { crearDependenciasConBase, type InfraestructuraConBase } from './dependencias.ts';
import type { OpcionesServidor } from './http.ts';
import { crearInfraestructuraSupabase } from './supabase_real.ts';

const leer = (nombre: string): string | undefined => Deno.env.get(nombre);

let infraestructura: InfraestructuraConBase | undefined;

function obtenerInfraestructura(): InfraestructuraConBase {
  return (infraestructura ??= crearInfraestructuraSupabase(leer));
}

export function opcionesDesdeEntorno(): OpcionesServidor {
  return {
    // ORIGENES_PERMITIDOS es siempre un secreto de Supabase: no se puede cambiar desde la app.
    origenes: leerOrigenes(leer),
    // El cliente de Supabase se crea una vez; la configuración se lee de la base en cada
    // petición (issue #33), así un cambio en la app se aplica sin redesplegar. Un error de
    // configuración sale como respuesta JSON `error_interno`.
    verificador: () => obtenerInfraestructura().verificador,
    crear: () => crearDependenciasConBase(leer, obtenerInfraestructura()),
  };
}
