import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { atender } from './http.ts';
import { ErrorApi } from './errores.ts';
import { crearDependenciasPrueba } from './pruebas_recalculo.ts';
import { TOKEN_ADMIN, TOKEN_DECISOR } from './pruebas.ts';

const ORIGEN = 'https://guios.vercel.app';
const ORIGENES = [ORIGEN];

function solicitud(
  opciones: { metodo?: string; token?: string; origen?: string; cuerpo?: string } = {},
): Request {
  const cabeceras: Record<string, string> = { 'content-type': 'application/json' };
  if (opciones.token !== undefined) cabeceras['authorization'] = `Bearer ${opciones.token}`;
  if (opciones.origen !== undefined) cabeceras['origin'] = opciones.origen;
  const metodo = opciones.metodo ?? 'POST';
  return new Request('http://localhost/functions/v1/prueba', {
    method: metodo,
    headers: cabeceras,
    ...(metodo === 'GET' || metodo === 'OPTIONS' ? {} : { body: opciones.cuerpo ?? '{}' }),
  });
}

function atenderCon(
  peticion: Request,
  accion = () => Promise.resolve({ estado: 200, cuerpo: { ok: true } }),
) {
  const dependencias = crearDependenciasPrueba();
  let accionEjecutada = false;
  const respuesta = atender(peticion, { origenes: ORIGENES, crear: () => dependencias }, () => {
    accionEjecutada = true;
    return accion();
  });
  return respuesta.then((r) => ({ respuesta: r, ejecutada: () => accionEjecutada }));
}

Deno.test(
  'CORS: el preflight desde el origen del frontend se contesta con sus cabeceras',
  async () => {
    const { respuesta, ejecutada } = await atenderCon(
      solicitud({ metodo: 'OPTIONS', origen: ORIGEN }),
    );
    assertEquals(respuesta.status, 204);
    assertEquals(respuesta.headers.get('access-control-allow-origin'), ORIGEN);
    assertStringIncludes(
      respuesta.headers.get('access-control-allow-headers') ?? '',
      'authorization',
    );
    assertStringIncludes(respuesta.headers.get('access-control-allow-methods') ?? '', 'POST');
    assertEquals(respuesta.headers.get('vary'), 'Origin');
    assertEquals(ejecutada(), false);
  },
);

Deno.test(
  'CORS: un origen que no es el del frontend recibe 403 y ninguna cabecera CORS',
  async () => {
    for (const metodo of ['OPTIONS', 'POST']) {
      const { respuesta, ejecutada } = await atenderCon(
        solicitud({ metodo, origen: 'https://malicioso.example', token: TOKEN_ADMIN }),
      );
      assertEquals(respuesta.status, 403);
      assertEquals(respuesta.headers.get('access-control-allow-origin'), null);
      assertEquals((await respuesta.json()).codigo, 'origen_no_permitido');
      assertEquals(ejecutada(), false);
    }
  },
);

Deno.test('CORS: las respuestas (también los errores) llevan el origen permitido', async () => {
  const exito = await atenderCon(solicitud({ origen: ORIGEN, token: TOKEN_ADMIN }));
  assertEquals(exito.respuesta.headers.get('access-control-allow-origin'), ORIGEN);
  const error = await atenderCon(solicitud({ origen: ORIGEN }));
  assertEquals(error.respuesta.status, 401);
  assertEquals(error.respuesta.headers.get('access-control-allow-origin'), ORIGEN);
});

Deno.test('una llamada sin origen (servidor a servidor) no se bloquea: manda el JWT', async () => {
  const { respuesta } = await atenderCon(solicitud({ token: TOKEN_ADMIN }));
  assertEquals(respuesta.status, 200);
  assertEquals(respuesta.headers.get('access-control-allow-origin'), null);
});

Deno.test('solo se acepta POST', async () => {
  const { respuesta } = await atenderCon(solicitud({ metodo: 'GET', token: TOKEN_ADMIN }));
  assertEquals(respuesta.status, 405);
  assertEquals((await respuesta.json()).codigo, 'metodo_no_permitido');
});

Deno.test('un decisor recibe 403 y la acción no se ejecuta', async () => {
  const { respuesta, ejecutada } = await atenderCon(solicitud({ token: TOKEN_DECISOR }));
  assertEquals(respuesta.status, 403);
  assertEquals((await respuesta.json()).codigo, 'solo_administrador');
  assertEquals(ejecutada(), false);
});

Deno.test('sin sesión o con un JWT inválido recibe 401', async () => {
  for (const token of [undefined, 'token-falso']) {
    const { respuesta, ejecutada } = await atenderCon(
      solicitud(token === undefined ? {} : { token }),
    );
    assertEquals(respuesta.status, 401);
    assertEquals(ejecutada(), false);
  }
});

Deno.test('un cuerpo que no es JSON recibe 400 solicitud_invalida', async () => {
  const { respuesta, ejecutada } = await atenderCon(
    solicitud({ token: TOKEN_ADMIN, cuerpo: '{no es json' }),
  );
  assertEquals(respuesta.status, 400);
  const cuerpo = await respuesta.json();
  assertEquals(cuerpo.codigo, 'solicitud_invalida');
  assert(typeof cuerpo.error === 'string' && cuerpo.error.length > 0);
  assertEquals(ejecutada(), false);
});

Deno.test('un ErrorApi se devuelve como {error, codigo} con sus datos extra', async () => {
  const { respuesta } = await atenderCon(solicitud({ token: TOKEN_ADMIN }), () =>
    Promise.reject(new ErrorApi(409, 'conflicto', 'Ya existe.', { estado: 'pausado' })),
  );
  assertEquals(respuesta.status, 409);
  assertEquals(await respuesta.json(), {
    error: 'Ya existe.',
    codigo: 'conflicto',
    estado: 'pausado',
  });
});

Deno.test('un error inesperado es 500 error_interno y no revela su detalle', async () => {
  const { respuesta } = await atenderCon(solicitud({ token: TOKEN_ADMIN }), () =>
    Promise.reject(new Error('password=secreto en la consulta SQL')),
  );
  assertEquals(respuesta.status, 500);
  const cuerpo = await respuesta.json();
  assertEquals(cuerpo.codigo, 'error_interno');
  assert(!JSON.stringify(cuerpo).includes('secreto'));
});

/** Opciones cuyo `crear` falla como lo haría una configuración incompleta o inválida. */
function opcionesConConfiguracionRota(creaciones: { cantidad: number }, error: Error) {
  return {
    origenes: ORIGENES,
    crear: () => {
      creaciones.cantidad++;
      throw error;
    },
  };
}

const ERROR_CONFIGURACION = new ErrorApi(
  500,
  'configuracion_invalida',
  'La variable LLM_UMBRAL no es válida.',
);

Deno.test(
  'sin token y con configuración rota responde 401 sin nombrar variables ni crear dependencias',
  async () => {
    const creaciones = { cantidad: 0 };
    const respuesta = await atender(
      solicitud({ origen: ORIGEN }),
      opcionesConConfiguracionRota(creaciones, ERROR_CONFIGURACION),
      () => Promise.resolve({ estado: 200, cuerpo: {} }),
    );
    assertEquals(respuesta.status, 401);
    const texto = JSON.stringify(await respuesta.json());
    assertEquals((JSON.parse(texto) as { codigo: string }).codigo, 'no_autenticado');
    assert(!texto.includes('LLM_UMBRAL') && !texto.includes('SUPABASE'));
    assertEquals(creaciones.cantidad, 0);
    assertEquals(respuesta.headers.get('access-control-allow-origin'), ORIGEN);
  },
);

Deno.test(
  'con token y configuración rota responde 500 error_interno sin nombrar variables',
  async () => {
    const registrado: unknown[][] = [];
    const original = console.error;
    console.error = (...argumentos: unknown[]) => void registrado.push(argumentos);
    try {
      for (const error of [
        ERROR_CONFIGURACION,
        new ErrorApi(
          500,
          'configuracion_incompleta',
          'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno de la función.',
        ),
      ]) {
        const respuesta = await atender(
          solicitud({ origen: ORIGEN, token: TOKEN_ADMIN }),
          opcionesConConfiguracionRota({ cantidad: 0 }, error),
          () => Promise.resolve({ estado: 200, cuerpo: {} }),
        );
        assertEquals(respuesta.status, 500);
        const cuerpo = await respuesta.json();
        assertEquals(cuerpo.codigo, 'error_interno');
        assert(!JSON.stringify(cuerpo).match(/LLM_UMBRAL|SUPABASE|variable/i));
        assertEquals(respuesta.headers.get('access-control-allow-origin'), ORIGEN);
      }
    } finally {
      console.error = original;
    }
    // El detalle (con el nombre de la variable) queda solo en el registro del servidor.
    const registro = registrado.map((a) => a.map(String).join(' ')).join(' | ');
    assertStringIncludes(registro, 'LLM_UMBRAL');
  },
);

Deno.test(
  'un secreto que falta durante la acción (usuario ya autenticado) tampoco nombra la variable',
  async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const { respuesta } = await atenderCon(solicitud({ token: TOKEN_ADMIN }), () =>
        Promise.reject(
          new ErrorApi(
            500,
            'configuracion_incompleta',
            'Falta configurar GEMINI_API_KEY en los secretos de Supabase.',
          ),
        ),
      );
      assertEquals(respuesta.status, 500);
      const cuerpo = await respuesta.json();
      assertEquals(cuerpo.codigo, 'error_interno');
      assert(!JSON.stringify(cuerpo).includes('GEMINI_API_KEY'));
    } finally {
      console.error = original;
    }
  },
);

Deno.test(
  'un decisor con configuración correcta sigue recibiendo 403 antes de leer el cuerpo',
  async () => {
    const { respuesta, ejecutada } = await atenderCon(
      solicitud({ token: TOKEN_DECISOR, cuerpo: '{no es json' }),
    );
    assertEquals(respuesta.status, 403);
    assertEquals(ejecutada(), false);
  },
);
