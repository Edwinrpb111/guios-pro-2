import type { User } from '@supabase/supabase-js';

/**
 * Nombre para mostrar: el `nombre_completo` con que se registró el usuario (guardado en los
 * metadatos de Supabase Auth) o, si falta, la parte local del correo; sin ninguno, «Usuario».
 */
export function nombreDeUsuario(usuario: Pick<User, 'email' | 'user_metadata'> | null): string {
  const registrado: unknown = usuario?.user_metadata?.['nombre_completo'];
  if (typeof registrado === 'string' && registrado.trim() !== '') return registrado.trim();
  const local = usuario?.email?.split('@')[0]?.trim() ?? '';
  return local === '' ? 'Usuario' : local;
}

/** Primera palabra del nombre, para el saludo. */
export const primerNombre = (nombre: string): string => nombre.trim().split(/\s+/)[0] ?? nombre;

/** Hasta dos iniciales en mayúscula. */
export function iniciales(nombre: string): string {
  const letras = nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra.charAt(0).toUpperCase());
  return letras.join('') || '?';
}
