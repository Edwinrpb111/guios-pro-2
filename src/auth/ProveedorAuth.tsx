import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { ContextoAuth, type Rol, type ValorAuth } from './contexto';
import { traducirErrorAuth } from './errores';

const ROLES: readonly string[] = ['decisor', 'administrador'];

/**
 * Mantiene la sesión de Supabase Auth y el rol del usuario (tabla `perfil`)
 * y los expone con `useAuth()`.
 */
export function ProveedorAuth({ children }: { children: ReactNode }) {
  const [inicializada, setInicializada] = useState(false);
  const [sesion, setSesion] = useState<Session | null>(null);
  // Rol resuelto para un usuario concreto; sirve para saber si ya corresponde a la sesión actual.
  const [rolDe, setRolDe] = useState<{ id: string; rol: Rol | null } | null>(null);

  useEffect(() => {
    let activo = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!activo) return;
      setSesion((actual) => actual ?? data.session);
      setInicializada(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion);
      setInicializada(true);
    });
    return () => {
      activo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const idUsuario = sesion?.user.id ?? null;

  useEffect(() => {
    if (!idUsuario) return;
    let activo = true;
    // Fuera del callback de onAuthStateChange para no bloquear el cliente de Auth.
    void supabase
      .from('perfil')
      .select('rol')
      .eq('id', idUsuario)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!activo) return;
        const rol = !error && data && ROLES.includes(data.rol) ? (data.rol as Rol) : null;
        setRolDe({ id: idUsuario, rol });
      });
    return () => {
      activo = false;
    };
  }, [idUsuario]);

  const iniciarSesion = useCallback<ValorAuth['iniciarSesion']>(async (correo, contrasena) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: correo,
      password: contrasena,
    });
    return { error: error ? traducirErrorAuth(error) : null };
  }, []);

  const registrar = useCallback<ValorAuth['registrar']>(
    async (nombreCompleto, correo, contrasena) => {
      const { data, error } = await supabase.auth.signUp({
        email: correo,
        password: contrasena,
        options: { data: { nombre_completo: nombreCompleto } },
      });
      if (error) return { error: traducirErrorAuth(error), requiereConfirmacion: false };
      return { error: null, requiereConfirmacion: !data.session };
    },
    [],
  );

  const cerrarSesion = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const valor = useMemo<ValorAuth>(() => {
    const rolListo = idUsuario === null || rolDe?.id === idUsuario;
    return {
      sesion,
      usuario: sesion?.user ?? null,
      rol: idUsuario !== null && rolDe?.id === idUsuario ? rolDe.rol : null,
      cargando: !inicializada || !rolListo,
      iniciarSesion,
      registrar,
      cerrarSesion,
    };
  }, [sesion, idUsuario, rolDe, inicializada, iniciarSesion, registrar, cerrarSesion]);

  return <ContextoAuth.Provider value={valor}>{children}</ContextoAuth.Provider>;
}
