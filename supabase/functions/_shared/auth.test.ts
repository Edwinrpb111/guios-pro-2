import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { exigirAdmin, extraerJwt } from './auth.ts';
import { ErrorApi } from './errores.ts';
import { TOKEN_ADMIN, TOKEN_DECISOR, verificadorFalso } from './pruebas.ts';

function peticion(autorizacion?: string): Request {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: autorizacion === undefined ? {} : { authorization: autorizacion },
  });
}

Deno.test('extraerJwt: solo acepta el esquema Bearer con un token', () => {
  assertEquals(extraerJwt(peticion('Bearer abc.def')), 'abc.def');
  assertEquals(extraerJwt(peticion('bearer abc')), 'abc');
  assertEquals(extraerJwt(peticion('Basic abc')), null);
  assertEquals(extraerJwt(peticion('Bearer')), null);
  assertEquals(extraerJwt(peticion()), null);
});

Deno.test('exigirAdmin: un administrador pasa', async () => {
  const usuario = await exigirAdmin(peticion(`Bearer ${TOKEN_ADMIN}`), verificadorFalso);
  assertEquals(usuario, { idUsuario: 'id-admin', esAdmin: true });
});

Deno.test('exigirAdmin: un decisor recibe 403', async () => {
  const error = await assertRejects(
    () => exigirAdmin(peticion(`Bearer ${TOKEN_DECISOR}`), verificadorFalso),
    ErrorApi,
  );
  assertEquals([error.estado, error.codigo], [403, 'solo_administrador']);
});

Deno.test('exigirAdmin: sin token o con un token inválido recibe 401', async () => {
  for (const [autorizacion, codigo] of [
    [undefined, 'no_autenticado'],
    ['Bearer token-falso', 'sesion_invalida'],
  ] as const) {
    const error = await assertRejects(
      () => exigirAdmin(peticion(autorizacion), verificadorFalso),
      ErrorApi,
    );
    assertEquals([error.estado, error.codigo], [401, codigo]);
  }
});
