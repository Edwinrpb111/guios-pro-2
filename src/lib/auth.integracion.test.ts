import { createClient } from '@supabase/supabase-js';
import { env } from 'node:process';
import type { Database } from './database.types';

/**
 * Prueba de integración contra Supabase local (criterio del issue #5):
 * registro, lectura del perfil, cierre e inicio de sesión.
 * Solo corre si se definen SUPABASE_URL_PRUEBAS y SUPABASE_ANON_KEY_PRUEBAS
 * (ver docs/variables-entorno.md); en la CI se omite.
 */
const url = env['SUPABASE_URL_PRUEBAS'];
const claveAnonima = env['SUPABASE_ANON_KEY_PRUEBAS'];

describe.skipIf(!url || !claveAnonima)('Autenticación contra Supabase local', () => {
  it('registra, lee el perfil, cierra e inicia sesión', async () => {
    if (!url || !claveAnonima) throw new Error('Faltan las variables de pruebas de integración');
    const supabase = createClient<Database>(url, claveAnonima, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const correo = `prueba-${crypto.randomUUID()}@example.com`;
    const contrasena = 'clave-de-prueba-1234';

    // Registro: el disparador crea el perfil con rol decisor y el nombre indicado.
    const registro = await supabase.auth.signUp({
      email: correo,
      password: contrasena,
      options: { data: { nombre_completo: 'Usuaria de Prueba' } },
    });
    expect(registro.error).toBeNull();
    expect(registro.data.session).not.toBeNull();
    const idUsuario = registro.data.user?.id;
    expect(idUsuario).toBeTruthy();
    if (!idUsuario) return;

    const perfil = await supabase
      .from('perfil')
      .select('id, rol, nombre_completo')
      .eq('id', idUsuario)
      .maybeSingle();
    expect(perfil.error).toBeNull();
    expect(perfil.data).toEqual({
      id: idUsuario,
      rol: 'decisor',
      nombre_completo: 'Usuaria de Prueba',
    });

    // Cierre de sesión: sin sesión, RLS no deja leer el perfil.
    expect((await supabase.auth.signOut()).error).toBeNull();
    expect((await supabase.auth.getSession()).data.session).toBeNull();
    const sinSesion = await supabase.from('perfil').select('id').eq('id', idUsuario);
    expect(sinSesion.data).toEqual([]);

    // Inicio de sesión con las mismas credenciales.
    const ingreso = await supabase.auth.signInWithPassword({ email: correo, password: contrasena });
    expect(ingreso.error).toBeNull();
    expect(ingreso.data.user?.id).toBe(idUsuario);

    // Credenciales erróneas: código que la interfaz traduce.
    await supabase.auth.signOut();
    const mala = await supabase.auth.signInWithPassword({
      email: correo,
      password: 'incorrecta-123',
    });
    expect(mala.error?.code).toBe('invalid_credentials');
  });
});
