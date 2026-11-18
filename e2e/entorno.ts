import { execSync } from 'node:child_process';

/** Datos de la instancia local de Supabase que usa el E2E. */
export interface EntornoSupabase {
  url: string;
  claveAnonima: string;
  /** Solo se usa en Node para crear y borrar al usuario de prueba; nunca llega al navegador. */
  claveServicio: string;
}

const VARIABLES = {
  url: 'SUPABASE_URL_PRUEBAS',
  claveAnonima: 'SUPABASE_ANON_KEY_PRUEBAS',
  claveServicio: 'SUPABASE_SERVICE_ROLE_KEY_PRUEBAS',
} as const;

/** Convierte la salida de `supabase status -o env` (`CLAVE="valor"`) en un objeto. */
export function analizarSalidaDeEstado(salida: string): Record<string, string> {
  const valores: Record<string, string> = {};
  for (const linea of salida.split(/\r?\n/)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (coincidencia?.[1] !== undefined && coincidencia[2] !== undefined) {
      valores[coincidencia[1]] = coincidencia[2].replace(/^"(.*)"$/, '$1');
    }
  }
  return valores;
}

/**
 * Lee la URL y las claves de Supabase local: primero de las variables de entorno
 * (`SUPABASE_URL_PRUEBAS`, `SUPABASE_ANON_KEY_PRUEBAS`, `SUPABASE_SERVICE_ROLE_KEY_PRUEBAS`)
 * y, si faltan, de `npx supabase status -o env` (requiere `supabase start`).
 */
export function entornoSupabase(): EntornoSupabase {
  const delEntorno = {
    url: process.env[VARIABLES.url],
    claveAnonima: process.env[VARIABLES.claveAnonima],
    claveServicio: process.env[VARIABLES.claveServicio],
  };
  if (delEntorno.url && delEntorno.claveAnonima && delEntorno.claveServicio) {
    return { ...delEntorno } as EntornoSupabase;
  }

  let estado: Record<string, string>;
  try {
    estado = analizarSalidaDeEstado(
      execSync('npx supabase status -o env', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  } catch {
    throw new Error(
      'No se pudo leer Supabase local. Ejecuta `npx supabase start` o define ' +
        `${VARIABLES.url}, ${VARIABLES.claveAnonima} y ${VARIABLES.claveServicio} (docs/pruebas-e2e.md).`,
    );
  }
  const url = delEntorno.url ?? estado['API_URL'];
  const claveAnonima = delEntorno.claveAnonima ?? estado['ANON_KEY'];
  const claveServicio = delEntorno.claveServicio ?? estado['SERVICE_ROLE_KEY'];
  if (!url || !claveAnonima || !claveServicio) {
    throw new Error('`supabase status -o env` no devolvió API_URL, ANON_KEY y SERVICE_ROLE_KEY.');
  }
  return { url, claveAnonima, claveServicio };
}
