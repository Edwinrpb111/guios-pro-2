// Proveedor del clasificador «compatible con OpenAI» (issue #40, S14): OpenRouter, Groq,
// DeepSeek, Mistral, OpenAI… Todo con `fetch` falso y reloj falso: ninguna prueba usa la red ni
// duerme de verdad.
import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertNotMatch,
  assertRejects,
  assertStringIncludes,
} from 'jsr:@std/assert@1';
import { ClasificadorCompatibleOpenAI } from './clasificador_openai.ts';
import { GeminiClasificador } from './clasificador.ts';
import { crearDependencias, type Dependencias } from './dependencias.ts';
import { ErrorApi, ErrorProveedorNoDisponible, ErrorRespuestaInvalida } from './errores.ts';
import { atender } from './http.ts';
import { iniciar } from './recalculo_iniciar.ts';
import { paso } from './recalculo_paso.ts';
import {
  candidato,
  CONTEXTO_PRUEBA,
  crearFetchGuionado,
  crearRelojFalso,
  proveedorFijo,
  respuestaJson,
  TOKEN_ADMIN,
  verificadorFalso,
} from './pruebas.ts';
import { RepositorioMemoria } from './pruebas_recalculo.ts';
import { RitmoDeLlamadas } from './ritmo.ts';

const CLAVE = 'sk-or-clave-secreta-de-prueba';
const URL_BASE = 'https://openrouter.ai/api/v1';
const MODELO = 'meta-llama/llama-3.3-70b-instruct:free';
const MENSAJE_PAUSA =
  'El proveedor de IA no está disponible o alcanzó su cuota. Reanuda el cálculo más tarde.';

const VEREDICTOS = [
  { indice: 1, trata_subfactor: true, confianza: 0.95, evidencia: 'trata el tema' },
  { indice: 2, trata_subfactor: true, confianza: 0.4, evidencia: 'poca relación' },
  { indice: 3, trata_subfactor: false, confianza: 0.9, evidencia: 'otro tema' },
];

/** Respuesta de chat/completions con `contenido` como texto del mensaje del asistente. */
function respuestaChat(contenido: string) {
  return respuestaJson({
    choices: [{ index: 0, message: { role: 'assistant', content: contenido } }],
  });
}

const ok = () => respuestaChat(JSON.stringify(VEREDICTOS));

function fallo(estado: number, cabeceras: Record<string, string> = {}) {
  return respuestaJson(
    { error: { message: 'detalle del proveedor', code: estado } },
    estado,
    cabeceras,
  );
}

type Reloj = ReturnType<typeof crearRelojFalso>;

function crear(
  reloj: Reloj,
  fetch: typeof globalThis.fetch,
  entorno: Record<string, string> = {},
  candidatos = 3,
) {
  const variables: Record<string, string> = {
    LLM_PROVIDER: 'openai',
    OPENAI_COMPAT_BASE_URL: URL_BASE,
    OPENAI_COMPAT_MODEL: MODELO,
    OPENAI_COMPAT_API_KEY: CLAVE,
    OPENALEX_API_KEY: 'otra-clave',
    ...entorno,
  };
  const repositorio = new RepositorioMemoria();
  const base = crearDependencias(
    (nombre) => variables[nombre],
    { repositorio, verificador: verificadorFalso },
    { ahora: reloj.ahora, esperar: (ms) => reloj.esperar(ms), fetch },
  );
  const deps: Dependencias = {
    ...base,
    contexto: CONTEXTO_PRUEBA,
    proveedores: (fuentes) =>
      fuentes.map((f) =>
        proveedorFijo(
          f,
          Array.from({ length: candidatos }, (_, i) => candidato(i + 1)),
        ),
      ),
  };
  return { deps, repositorio };
}

function llamar(deps: Dependencias, cuerpo: unknown) {
  return atender(
    new Request('http://localhost/functions/v1/recalculo-paso', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN_ADMIN}` },
      body: JSON.stringify(cuerpo),
    }),
    { origenes: [], verificador: () => verificadorFalso, crear: () => deps },
    (entrada, admin, dependencias) => paso(entrada, admin, dependencias),
  );
}

const ENTRADA_INICIO = { anio_inicio: 2020, anio_fin: 2025, fuentes: ['openalex'] };

async function nuevoCalculo(deps: Dependencias): Promise<number> {
  const respuesta = await atender(
    new Request('http://localhost/', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN_ADMIN}` },
      body: JSON.stringify(ENTRADA_INICIO),
    }),
    { origenes: [], verificador: () => verificadorFalso, crear: () => deps },
    (entrada, admin, dependencias) => iniciar(entrada, admin, dependencias),
  );
  return (await respuesta.json()).id_calculo;
}

function clasificador(fetch: typeof globalThis.fetch, reloj?: Reloj) {
  return new ClasificadorCompatibleOpenAI({
    apiKey: CLAVE,
    urlBase: URL_BASE,
    modelo: MODELO,
    fetch,
    ...(reloj === undefined
      ? {}
      : {
          ritmo: new RitmoDeLlamadas(
            { ahora: reloj.ahora, esperar: (ms) => reloj.esperar(ms) },
            15,
          ),
        }),
  });
}

const LOTE = [candidato(1), candidato(2), candidato(3)];
const clasificarLote = (c: ClasificadorCompatibleOpenAI) =>
  c.clasificar('Compatibilidad', 'Formatos estándar', 'Uso de formatos abiertos.', LOTE);

// (a) Un paso con el proveedor «openai» clasifica y guarda referencias ----------------------

Deno.test(
  'openai: un paso clasifica con chat/completions y guarda las referencias aceptadas',
  async () => {
    const reloj = crearRelojFalso();
    const { fetch, llamadas } = crearFetchGuionado([ok()]);
    const { deps, repositorio } = crear(reloj, fetch);
    const id = await nuevoCalculo(deps);

    const respuesta = await llamar(deps, { id_calculo: id });

    assertEquals(respuesta.status, 200);
    // Se acepta el 1 (0,95 ≥ 0,7); el 2 (0,4) y el 3 (no trata el subfactor) se descartan.
    assertEquals(repositorio.doisDe(id, 11), ['10.1000/art.1']);
    assertEquals(repositorio.pasos.get(id)?.get(11)?.estado, 'hecho');
    assertEquals(repositorio.calculos.get(id)?.parametros?.proveedor_llm, 'openai');
    assertEquals(repositorio.calculos.get(id)?.parametros?.modelo, MODELO);

    assertEquals(llamadas.length, 1);
    const peticion = llamadas[0]!;
    assertEquals(peticion.method, 'POST');
    // dirección base + /chat/completions; la clave NUNCA va en la URL.
    assertEquals(peticion.url, `${URL_BASE}/chat/completions`);
    assertNotMatch(peticion.url, /clave|sk-or|key/i);
    assertEquals(peticion.headers.get('authorization'), `Bearer ${CLAVE}`);
    assertEquals(peticion.headers.get('content-type'), 'application/json');
    const cuerpo = await peticion.json();
    assertEquals(cuerpo.model, MODELO);
    assertEquals(cuerpo.temperature, 0);
    assertEquals(cuerpo.response_format, { type: 'json_object' });
    assertEquals(
      cuerpo.messages.map((m: { role: string }) => m.role),
      ['system', 'user'],
    );
    assertNotMatch(JSON.stringify(cuerpo), /sk-or/);
  },
);

Deno.test('openai: usa el MISMO prompt e instrucción que Gemini', async () => {
  const gemini = crearFetchGuionado([
    respuestaJson({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }),
  ]);
  await new GeminiClasificador({
    apiKey: 'k',
    modelo: 'gemini-3.1-flash-lite',
    fetch: gemini.fetch,
  }).clasificar('Compatibilidad', 'Formatos estándar', 'Uso de formatos abiertos.', LOTE);
  const deGemini = await gemini.llamadas[0]!.json();

  const openai = crearFetchGuionado([ok()]);
  await clasificarLote(clasificador(openai.fetch));
  const deOpenai = await openai.llamadas[0]!.json();

  assertEquals(deOpenai.messages[0].content, deGemini.systemInstruction.parts[0].text);
  assertEquals(deOpenai.messages[1].content, deGemini.contents[0].parts[0].text);
  assertStringIncludes(deOpenai.messages[1].content, 'Subfactor: Formatos estándar');
  assertStringIncludes(deOpenai.messages[1].content, '1. Artículo 1');
});

Deno.test('openai: la dirección base con «/» final no duplica la barra', async () => {
  const { fetch, llamadas } = crearFetchGuionado([ok()]);
  const c = new ClasificadorCompatibleOpenAI({
    apiKey: CLAVE,
    urlBase: 'https://api.groq.com/openai/v1/',
    modelo: 'llama-3.3-70b-versatile',
    fetch,
  });
  await clasificarLote(c);
  assertEquals(llamadas[0]!.url, 'https://api.groq.com/openai/v1/chat/completions');
});

Deno.test(
  'openai: no sigue redirecciones, para que la clave no viaje a otro servidor',
  async () => {
    const { fetch, llamadas } = crearFetchGuionado([ok()]);
    await clasificarLote(clasificador(fetch));
    assertEquals(llamadas[0]!.redirect, 'error');
  },
);

Deno.test(
  'openai: el ritmo por minuto se aplica antes de cada llamada, como con Gemini',
  async () => {
    const reloj = crearRelojFalso();
    const horas: number[] = [];
    const { fetch } = crearFetchGuionado([
      () => {
        horas.push(reloj.ahora());
        return ok();
      },
    ]);
    const { deps } = crear(reloj, fetch, { LLM_LLAMADAS_POR_MINUTO: '30' }, 25);
    const id = await nuevoCalculo(deps);

    assertEquals((await llamar(deps, { id_calculo: id })).status, 200);

    assertEquals(horas.length, 3); // 25 candidatos = 3 lotes
    for (let i = 1; i < horas.length; i++) {
      assert(horas[i]! - horas[i - 1]! >= 2000, 'a 30 por minuto, 2 s o más entre llamadas');
    }
  },
);

Deno.test('openai: un cálculo iniciado con otro proveedor da proveedor_cambiado', async () => {
  const reloj = crearRelojFalso();
  const { fetch } = crearFetchGuionado([ok()]);
  const { deps, repositorio } = crear(reloj, fetch);
  const id = await nuevoCalculo(deps);

  const otro = crear(reloj, fetch, { LLM_PROVIDER: 'fake' }).deps;
  const respuesta = await llamar({ ...otro, repositorio }, { id_calculo: id });
  assertEquals(respuesta.status, 409);
  assertEquals((await respuesta.json()).codigo, 'proveedor_cambiado');
});

Deno.test(
  'openai: sin dirección base, modelo o clave el inicio falla con un mensaje claro',
  async () => {
    const reloj = crearRelojFalso();
    const { fetch } = crearFetchGuionado([ok()]);
    for (const faltante of [
      'OPENAI_COMPAT_BASE_URL',
      'OPENAI_COMPAT_MODEL',
      'OPENAI_COMPAT_API_KEY',
    ]) {
      const { deps } = crear(reloj, fetch, { [faltante]: '' });
      // El cliente solo ve `error_interno` (http.ts); aquí se mira el error de verdad.
      const error = await assertRejects(
        () => iniciar(ENTRADA_INICIO, { idUsuario: 'id-admin', esAdmin: true }, deps),
        ErrorApi,
      );
      assertEquals([error.estado, error.codigo], [500, 'configuracion_incompleta']);
      assertStringIncludes(error.message, faltante);
    }
  },
);

Deno.test('openai: crearDependencias arma el clasificador compatible con la configuración', () => {
  const { deps } = crear(crearRelojFalso(), crearFetchGuionado([ok()]).fetch);
  assertEquals(deps.configuracion.proveedorLlm, 'openai');
  assertInstanceOf(deps.clasificador(MODELO), ClasificadorCompatibleOpenAI);
});

// (b) Respuestas con JSON dentro de un bloque, objeto envoltorio o inservibles ---------------

Deno.test('openai: acepta la respuesta en un bloque ```json con texto alrededor', async () => {
  const texto =
    'Claro, aquí está la clasificación:\n```json\n' +
    JSON.stringify(VEREDICTOS) +
    '\n```\nEspero que sirva.';
  const { fetch } = crearFetchGuionado([respuestaChat(texto)]);
  assertEquals(await clasificarLote(clasificador(fetch)), VEREDICTOS);
});

Deno.test('openai: acepta un bloque ``` sin lenguaje y un arreglo suelto entre texto', async () => {
  for (const texto of [
    '```\n' + JSON.stringify(VEREDICTOS) + '\n```',
    'Resultado: ' + JSON.stringify(VEREDICTOS) + ' fin.',
  ]) {
    const { fetch } = crearFetchGuionado([respuestaChat(texto)]);
    assertEquals(await clasificarLote(clasificador(fetch)), VEREDICTOS);
  }
});

Deno.test(
  'openai: acepta el objeto que exige response_format json_object con el arreglo dentro',
  async () => {
    const unico = { indice: 1, trata_subfactor: true, confianza: 0.9, evidencia: 'único' };
    for (const [objeto, esperados] of [
      [{ resultados: VEREDICTOS }, VEREDICTOS],
      [{ nota: 'x', clasificacion: VEREDICTOS }, VEREDICTOS],
      [unico, [unico]],
      [{ resultados: [] }, []],
    ] as const) {
      const { fetch } = crearFetchGuionado([respuestaChat(JSON.stringify(objeto))]);
      assertEquals(await clasificarLote(clasificador(fetch)), esperados);
    }
  },
);

Deno.test('openai: acepta el contenido como lista de partes de texto', async () => {
  const { fetch } = crearFetchGuionado([
    respuestaJson({
      choices: [
        {
          message: {
            content: [
              { type: 'text', text: JSON.stringify(VEREDICTOS.slice(0, 1)) },
              { type: 'text', text: '' },
            ],
          },
        },
      ],
    }),
  ]);
  assertEquals(await clasificarLote(clasificador(fetch)), VEREDICTOS.slice(0, 1));
});

Deno.test('openai: descarta los elementos mal formados en lugar de fallar el lote', async () => {
  const mezcla = [VEREDICTOS[0], { indice: 'dos' }, null, 7, VEREDICTOS[2]];
  const { fetch } = crearFetchGuionado([respuestaChat(JSON.stringify(mezcla))]);
  assertEquals(await clasificarLote(clasificador(fetch)), [VEREDICTOS[0], VEREDICTOS[2]]);
});

Deno.test('openai: una respuesta que no es JSON es ErrorRespuestaInvalida', async () => {
  for (const cuerpo of [
    respuestaChat('Lo siento, no puedo ayudar con eso.'),
    respuestaChat('```json\n{ no es json }\n```'),
    respuestaChat('"solo una cadena"'),
    respuestaChat('{"sin": "arreglo"}'),
    respuestaChat(''),
    respuestaJson({ choices: [] }),
    respuestaJson({ choices: [{ message: { content: null } }] }),
    respuestaJson({ otra: 'cosa' }),
    new Response('<html>no es JSON</html>', { status: 200 }),
  ]) {
    const { fetch } = crearFetchGuionado([cuerpo]);
    await assertRejects(() => clasificarLote(clasificador(fetch)), ErrorRespuestaInvalida);
  }
});

Deno.test(
  'openai: JSON inválido pausa el cálculo con respuesta_invalida y marca el paso',
  async () => {
    const reloj = crearRelojFalso();
    const { fetch } = crearFetchGuionado([respuestaChat('esto no es JSON')]);
    const { deps, repositorio } = crear(reloj, fetch);
    const id = await nuevoCalculo(deps);

    const respuesta = await llamar(deps, { id_calculo: id });

    assertEquals(respuesta.status, 502);
    const cuerpo = await respuesta.json();
    assertEquals(cuerpo.codigo, 'respuesta_invalida');
    assertEquals(cuerpo.estado, 'pausado');
    assertEquals(repositorio.calculos.get(id)?.estado, 'pausado');
    assertEquals(repositorio.pasos.get(id)?.get(11)?.estado, 'error');
    assertEquals(repositorio.referencias.length, 0);
  },
);

Deno.test(
  'openai: otro 4xx (modelo o dirección equivocados) es respuesta inválida con el código HTTP',
  async () => {
    const { fetch } = crearFetchGuionado([fallo(404)]);
    const error = await assertRejects(
      () => clasificarLote(clasificador(fetch)),
      ErrorRespuestaInvalida,
    );
    assertStringIncludes(error.message, 'HTTP 404');
  },
);

// (c) 429/503: Retry-After, reintentos y pausa -----------------------------------------------

Deno.test('openai: un 429 con Retry-After espera esos segundos, reintenta y no pausa', async () => {
  const reloj = crearRelojFalso();
  const horas: number[] = [];
  const { fetch, llamadas } = crearFetchGuionado([
    () => {
      horas.push(reloj.ahora());
      return fallo(429, { 'retry-after': '7' });
    },
    () => {
      horas.push(reloj.ahora());
      return ok();
    },
  ]);
  const { deps, repositorio } = crear(reloj, fetch);
  const id = await nuevoCalculo(deps);

  const respuesta = await llamar(deps, { id_calculo: id });

  assertEquals(respuesta.status, 200);
  assertEquals(llamadas.length, 2);
  assertEquals(repositorio.calculos.get(id)?.estado, 'en_proceso');
  assertEquals(repositorio.doisDe(id, 11), ['10.1000/art.1']);
  // 4 s del primer turno (15 por minuto) y 7 s de Retry-After; el turno del reintento ya pasó.
  assertEquals(reloj.esperas, [4000, 7000]);
  assertEquals(horas[1]! - horas[0]!, 7000);
});

Deno.test('openai: un 503 sin Retry-After usa la espera por defecto y reintenta', async () => {
  const reloj = crearRelojFalso();
  const { fetch, llamadas } = crearFetchGuionado([fallo(503), ok()]);
  const { deps } = crear(reloj, fetch);
  const id = await nuevoCalculo(deps);

  assertEquals((await llamar(deps, { id_calculo: id })).status, 200);
  assertEquals(llamadas.length, 2);
  assertEquals(reloj.esperas[1], 5000);
});

Deno.test('openai: un Retry-After muy largo o ilegible se limita o se ignora', async () => {
  for (const [valor, esperada] of [
    ['600', 30_000],
    ['no-es-un-numero', 5_000],
    ['-3', 5_000],
    ['Wed, 21 Oct 2026 07:28:00 GMT', 5_000],
  ] as const) {
    const reloj = crearRelojFalso();
    const { fetch } = crearFetchGuionado([fallo(429, { 'retry-after': valor }), ok()]);
    await clasificarLote(clasificador(fetch, reloj));
    assertEquals(reloj.esperas[1], esperada, `Retry-After: ${valor}`);
  }
});

Deno.test(
  'openai: si el 429 persiste se agotan los reintentos y el cálculo queda pausado',
  async () => {
    const reloj = crearRelojFalso();
    const { fetch, llamadas } = crearFetchGuionado([fallo(429, { 'retry-after': '1' })]);
    const { deps, repositorio } = crear(reloj, fetch);
    const id = await nuevoCalculo(deps);

    const respuesta = await llamar(deps, { id_calculo: id });

    assertEquals(respuesta.status, 503);
    const cuerpo = await respuesta.json();
    assertEquals(cuerpo.codigo, 'proveedor_no_disponible');
    assertEquals(cuerpo.error, MENSAJE_PAUSA);
    assertEquals(llamadas.length, 4); // la llamada inicial + 3 reintentos
    assertEquals(repositorio.calculos.get(id)?.estado, 'pausado');
    assertEquals(repositorio.calculos.get(id)?.mensaje_error, MENSAJE_PAUSA);
    assertEquals(repositorio.referencias.length, 0);
  },
);

Deno.test('openai: sin ritmo un 429 no se reintenta', async () => {
  const { fetch, llamadas } = crearFetchGuionado([fallo(429), ok()]);
  await assertRejects(
    () => clasificarLote(clasificador(fetch)),
    ErrorProveedorNoDisponible,
    MENSAJE_PAUSA,
  );
  assertEquals(llamadas.length, 1);
});

// Otros fallos: mensajes neutrales, sin reintento -----------------------------------------------

Deno.test('openai: un 500, 502 o 504 pausa con un mensaje neutral y no se reintenta', async () => {
  for (const estado of [500, 502, 504]) {
    const reloj = crearRelojFalso();
    const { fetch, llamadas } = crearFetchGuionado([fallo(estado), ok()]);
    const error = await assertRejects(
      () => clasificarLote(clasificador(fetch, reloj)),
      ErrorProveedorNoDisponible,
    );
    assertEquals(error.message, MENSAJE_PAUSA);
    assertNotMatch(error.message, /gemini/i);
    assertEquals(llamadas.length, 1);
  }
});

Deno.test(
  'openai: una caída de red o un tiempo agotado es ErrorProveedorNoDisponible',
  async () => {
    const { fetch } = crearFetchGuionado([new TypeError('fallo de red')]);
    const error = await assertRejects(
      () => clasificarLote(clasificador(fetch)),
      ErrorProveedorNoDisponible,
    );
    assertStringIncludes(error.message, 'No se pudo conectar');
    assertNotMatch(error.message, /gemini/i);
  },
);

Deno.test('openai: la petición lleva un tiempo máximo (como Gemini)', async () => {
  let senal: AbortSignal | null | undefined;
  const fetchEspia = ((_entrada: RequestInfo | URL, init?: RequestInit) => {
    senal = init?.signal;
    return Promise.resolve(ok());
  }) as typeof fetch;
  await clasificarLote(clasificador(fetchEspia));
  assert(senal instanceof AbortSignal);
});

// (d) 401/403: clave rechazada, mensaje legible y sin reintento --------------------------------

Deno.test(
  'openai: un 401 da un mensaje legible sobre la clave, sin reintento y sin mostrarla',
  async () => {
    for (const estado of [401, 403]) {
      const reloj = crearRelojFalso();
      const { fetch, llamadas } = crearFetchGuionado([fallo(estado), ok()]);
      const { deps, repositorio } = crear(reloj, fetch);
      const id = await nuevoCalculo(deps);

      const respuesta = await llamar(deps, { id_calculo: id });

      assertEquals(respuesta.status, 503);
      const cuerpo = await respuesta.json();
      assertEquals(cuerpo.codigo, 'proveedor_no_disponible');
      assertStringIncludes(cuerpo.error, 'rechazó la clave');
      assertStringIncludes(cuerpo.error, 'OPENAI_COMPAT_API_KEY');
      assertNotMatch(cuerpo.error, /sk-or/);
      assertNotMatch(cuerpo.error, /gemini/i);
      assertEquals(llamadas.length, 1, 'una clave rechazada no se reintenta');
      assertEquals(repositorio.calculos.get(id)?.estado, 'pausado');
    }
  },
);

Deno.test('openai: un 402 (sin saldo) pausa con un mensaje que lo explica', async () => {
  const { fetch, llamadas } = crearFetchGuionado([fallo(402), ok()]);
  const error = await assertRejects(
    () => clasificarLote(clasificador(fetch, crearRelojFalso())),
    ErrorProveedorNoDisponible,
  );
  assertStringIncludes(error.message, 'saldo');
  assertEquals(llamadas.length, 1);
});
