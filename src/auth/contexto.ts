import type { Session, User } from '@supabase/supabase-js';
import { createContext } from 'react';

/** Roles de `perfil.rol` (BRIEF §10). */
export type Rol = 'decisor' | 'administrador';

export interface ResultadoInicioSesion {
  /** Mensaje en español, o `null` si salió bien. */
  error: string | null;
}

export interface ResultadoRegistro {
  /** Mensaje en español, o `null` si salió bien. */
  error: string | null;
  /** `true` si el proyecto exige confirmar el correo antes de entrar. */
  requiereConfirmacion: boolean;
}

export interface ValorAuth {
  sesion: Session | null;
  usuario: User | null;
  /** Rol leído de `perfil`; `null` sin sesión o si el perfil no se pudo leer. */
  rol: Rol | null;
  /** `true` hasta conocer la sesión y, si la hay, el rol. */
  cargando: boolean;
  iniciarSesion: (correo: string, contrasena: string) => Promise<ResultadoInicioSesion>;
  registrar: (
    nombreCompleto: string,
    correo: string,
    contrasena: string,
  ) => Promise<ResultadoRegistro>;
  cerrarSesion: () => Promise<void>;
}

export const ContextoAuth = createContext<ValorAuth | null>(null);
