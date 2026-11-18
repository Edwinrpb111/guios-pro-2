interface ErrorAuthBasico {
  code?: string | undefined;
  message?: string | undefined;
  name?: string | undefined;
}

const MENSAJE_GENERICO = 'No se pudo completar la operación. Inténtalo de nuevo.';
const MENSAJE_CREDENCIALES = 'Correo o contraseña incorrectos.';
const MENSAJE_LIMITE = 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
const MENSAJE_CUENTA_EXISTENTE = 'Ya existe una cuenta con ese correo.';

const POR_CODIGO: Record<string, string> = {
  invalid_credentials: MENSAJE_CREDENCIALES,
  user_already_exists: MENSAJE_CUENTA_EXISTENTE,
  email_exists: MENSAJE_CUENTA_EXISTENTE,
  weak_password: 'La contraseña debe tener al menos 8 caracteres.',
  email_not_confirmed: 'Debes confirmar tu correo antes de iniciar sesión.',
  over_request_rate_limit: MENSAJE_LIMITE,
  over_email_send_rate_limit: MENSAJE_LIMITE,
  validation_failed: 'Revisa que el correo tenga un formato válido.',
};

/** Traduce un error de Supabase Auth a un mensaje en español para el usuario. */
export function traducirErrorAuth(error: ErrorAuthBasico): string {
  const porCodigo = error.code ? POR_CODIGO[error.code] : undefined;
  if (porCodigo) return porCodigo;
  if (error.message === 'Invalid login credentials') return MENSAJE_CREDENCIALES;
  if (error.name === 'AuthRetryableFetchError' || error.message === 'Failed to fetch') {
    return 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.';
  }
  return MENSAJE_GENERICO;
}
