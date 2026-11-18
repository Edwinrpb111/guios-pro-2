import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { entornoSupabase } from './entorno';

/** Usuario de prueba creado con la API de administración de Supabase local. */
export interface UsuarioDePrueba {
  id: string;
  correo: string;
  contrasena: string;
  nombreCompleto: string;
}

function clienteAdministrador(): SupabaseClient {
  const { url, claveServicio } = entornoSupabase();
  return createClient(url, claveServicio, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Comprueba que la base local tenga el catálogo y el cálculo de IS vigente de la semilla
 * (`supabase/seed.sql`); si no, el E2E no tiene sentido y conviene fallar con un mensaje claro.
 */
export async function verificarSemilla(): Promise<void> {
  const admin = clienteAdministrador();
  const factores = await admin.from('factor').select('id_factor', { count: 'exact', head: true });
  const vigente = await admin.from('calculo_sugerida').select('id_calculo').eq('vigente', true);
  if (factores.error || vigente.error || factores.count !== 18 || vigente.data?.length !== 1) {
    throw new Error(
      'La base local no tiene la semilla (18 factores y un cálculo de IS vigente). ' +
        'Ejecuta `npm run db:reset` (docs/pruebas-e2e.md).',
    );
  }
}

/** Crea un usuario nuevo con el correo ya confirmado; el disparador de la BD le crea el perfil. */
export async function crearUsuarioDePrueba(): Promise<UsuarioDePrueba> {
  const sufijo = randomUUID().slice(0, 8);
  const usuario = {
    correo: `e2e-${sufijo}@guios.test`,
    contrasena: `Clave-${randomUUID()}`,
    nombreCompleto: 'Evaluador Piloto',
  };
  const { data, error } = await clienteAdministrador().auth.admin.createUser({
    email: usuario.correo,
    password: usuario.contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: usuario.nombreCompleto },
  });
  if (error || !data.user) {
    throw new Error(`No se pudo crear el usuario de prueba: ${error?.message ?? 'sin datos'}`);
  }
  return { id: data.user.id, ...usuario };
}

/** Borra al usuario; sus perfil, evaluaciones y valoraciones caen en cascada (RLS no aplica al rol de servicio). */
export async function borrarUsuarioDePrueba(usuario: UsuarioDePrueba): Promise<void> {
  const { error } = await clienteAdministrador().auth.admin.deleteUser(usuario.id);
  if (error) throw new Error(`No se pudo borrar el usuario de prueba: ${error.message}`);
}
