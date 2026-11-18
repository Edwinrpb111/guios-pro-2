import { traducirErrorAuth } from './errores';

describe('traducirErrorAuth', () => {
  it.each([
    ['invalid_credentials', 'Correo o contraseña incorrectos.'],
    ['user_already_exists', 'Ya existe una cuenta con ese correo.'],
    ['email_exists', 'Ya existe una cuenta con ese correo.'],
    ['weak_password', 'La contraseña debe tener al menos 8 caracteres.'],
    ['email_not_confirmed', 'Debes confirmar tu correo antes de iniciar sesión.'],
    ['over_request_rate_limit', 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'],
    ['validation_failed', 'Revisa que el correo tenga un formato válido.'],
  ])('traduce %s', (code, esperado) => {
    expect(traducirErrorAuth({ code, message: 'x' })).toBe(esperado);
  });

  it('usa el mensaje de credenciales cuando solo llega el texto en inglés', () => {
    expect(traducirErrorAuth({ message: 'Invalid login credentials' })).toBe(
      'Correo o contraseña incorrectos.',
    );
  });

  it('da un mensaje genérico para errores desconocidos', () => {
    expect(traducirErrorAuth({ code: 'otra_cosa', message: 'boom' })).toBe(
      'No se pudo completar la operación. Inténtalo de nuevo.',
    );
  });

  it('avisa de problemas de red', () => {
    expect(traducirErrorAuth({ message: 'Failed to fetch', name: 'AuthRetryableFetchError' })).toBe(
      'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.',
    );
  });
});
