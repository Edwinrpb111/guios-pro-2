// Autorización de las Edge Functions: solo un administrador (BRIEF §11.3, §14).
import { ErrorApi } from './errores.ts';

export interface UsuarioVerificado {
  idUsuario: string;
  esAdmin: boolean;
}

export interface VerificadorAdmin {
  /** Valida el JWT y devuelve quién es; `null` si el token no es válido. */
  verificar(jwt: string): Promise<UsuarioVerificado | null>;
}

/** Extrae el JWT de `Authorization: Bearer <jwt>`. */
export function extraerJwt(peticion: Request): string | null {
  const cabecera = peticion.headers.get('authorization');
  const coincidencia = cabecera?.match(/^Bearer\s+(\S+)$/i);
  return coincidencia?.[1] ?? null;
}

/** 401 si la petición no trae `Authorization: Bearer <jwt>`; no necesita configuración alguna. */
export function exigirJwt(peticion: Request): string {
  const jwt = extraerJwt(peticion);
  if (jwt === null) {
    throw new ErrorApi(401, 'no_autenticado', 'Inicia sesión para realizar esta operación.');
  }
  return jwt;
}

/** 401 sin sesión válida; 403 si el usuario es un decisor. */
export async function exigirAdmin(
  peticion: Request,
  verificador: VerificadorAdmin,
): Promise<UsuarioVerificado> {
  const jwt = exigirJwt(peticion);
  const usuario = await verificador.verificar(jwt);
  if (usuario === null) {
    throw new ErrorApi(
      401,
      'sesion_invalida',
      'Tu sesión no es válida o venció. Inicia sesión de nuevo.',
    );
  }
  if (!usuario.esAdmin) {
    throw new ErrorApi(
      403,
      'solo_administrador',
      'Solo un administrador puede recalcular la importancia sugerida.',
    );
  }
  return usuario;
}
