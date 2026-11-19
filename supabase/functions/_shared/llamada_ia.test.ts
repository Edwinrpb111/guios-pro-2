// Detalles de cada llamada a la IA (issue #45): razonamiento desactivado por proveedor (S16b),
// corte a los 45 s también al leer el cuerpo (S16c) y medición de tokens y reintentos por tanda
// (S16d). Todo con `fetch` y reloj falsos.
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { GeminiClasificador } from './clasificador.ts';
import { ClasificadorCompatibleOpenAI } from './clasificador_openai.ts';
import { crearDependencias } from './dependencias.ts';
import { ErrorProveedorNoDisponible, MENSAJE_IA_TARDO } from './errores.ts';
import {
  candidato,
  crearFetchGuionado,
  crearRelojFalso,
  respuestaJson,
  verificadorFalso,
} from './pruebas.ts';
import { RepositorioMemoria } from './pruebas_recalculo.ts';
import { RitmoDeLlamadas } from './ritmo.ts';
import type { MedicionLlamada } from './tipos.ts';

const CANDIDATOS = [candidato(1)];
const VEREDICTOS = [{ indice: 1, trata_subfactor: true, confianza: 0.9, evidencia: 'ok' }];

const respuestaGemini = (extra: Record<string, unknown> = {}) =>
  respuestaJson({
    candidates: [{ content: { parts: [{ text: JSON.stringify(VEREDICTOS) }] } }],
    ...extra,
  });
const respuestaChat = (extra: Record<string, unknown> = {}) =>
  respuestaJson({
    choices: [{ message: { content: JSON.stringify(VEREDICTOS) } }],
    ...extra,
  });

const medicionVacia = (): MedicionLlamada => ({
  reintentos: 0,
  tokensEntrada: null,
  tokensSalida: null,
  tokensRazonamiento: null,
});

async function cuerpoEnviado(llamadas: Request[]): Promise<Record<string, unknown>> {
  return (await llamadas[0]!.clone().json()) as Record<string, unknown>;
}

// S16b: razonamiento desactivado por proveedor -----------------------------------------------

Deno.test('Gemini: con desactivar razonamiento pide thinkingBudget 0', async () => {
  const { fetch, llamadas } = crearFetchGuionado([respuestaGemini()]);
  const clasificador = new GeminiClasificador({
    apiKey: 'clave',
    modelo: 'm',
    fetch,
    desactivarRazonamiento: true,
  });
  await clasificador.clasificar('F', 'S', 'C', CANDIDATOS);
  const cuerpo = (await cuerpoEnviado(llamadas)) as {
    generationConfig: Record<string, unknown>;
  };
  assertEquals(cuerpo.generationConfig['thinkingConfig'], { thinkingBudget: 0 });
  assertEquals(cuerpo.generationConfig['temperature'], 0, 'lo demás no cambia');
});

Deno.test(
  'Gemini: sin desactivar razonamiento no manda ningún parámetro de razonamiento',
  async () => {
    for (const opcion of [{}, { desactivarRazonamiento: false }]) {
      const { fetch, llamadas } = crearFetchGuionado([respuestaGemini()]);
      const clasificador = new GeminiClasificador({
        apiKey: 'clave',
        modelo: 'm',
        fetch,
        ...opcion,
      });
      await clasificador.clasificar('F', 'S', 'C', CANDIDATOS);
      assert(!JSON.stringify(await cuerpoEnviado(llamadas)).includes('thinking'));
    }
  },
);

const OPENAI_POR_HOST: [string, Record<string, unknown>][] = [
  ['https://openrouter.ai/api/v1', { reasoning: { enabled: false } }],
  ['https://api.deepseek.com', { thinking: { type: 'disabled' } }],
  ['https://api.deepseek.com/v1', { thinking: { type: 'disabled' } }],
];

Deno.test(
  'compatible con OpenAI: manda el parámetro propio de cada proveedor conocido',
  async () => {
    for (const [urlBase, esperado] of OPENAI_POR_HOST) {
      const { fetch, llamadas } = crearFetchGuionado([respuestaChat()]);
      const clasificador = new ClasificadorCompatibleOpenAI({
        apiKey: 'clave',
        urlBase,
        modelo: 'm',
        fetch,
        desactivarRazonamiento: true,
      });
      await clasificador.clasificar('F', 'S', 'C', CANDIDATOS);
      const cuerpo = await cuerpoEnviado(llamadas);
      for (const [clave, valor] of Object.entries(esperado)) {
        assertEquals(cuerpo[clave], valor, `${urlBase}: ${clave}`);
      }
    }
  },
);

Deno.test(
  'compatible con OpenAI: con un host desconocido no manda nada de razonamiento',
  async () => {
    const sinOpcion = crearFetchGuionado([respuestaChat()]);
    await new ClasificadorCompatibleOpenAI({
      apiKey: 'clave',
      urlBase: 'https://proveedor.example/v1',
      modelo: 'm',
      fetch: sinOpcion.fetch,
    }).clasificar('F', 'S', 'C', CANDIDATOS);
    const base = await cuerpoEnviado(sinOpcion.llamadas);

    for (const urlBase of [
      'https://proveedor.example/v1',
      'https://api.groq.com/openai/v1',
      'https://openrouter.ai.otro.example/api/v1', // parecido, pero no es OpenRouter
      'https://api.deepseek.com.otro.example',
      'https://otro.example/openrouter.ai',
    ]) {
      const { fetch, llamadas } = crearFetchGuionado([respuestaChat()]);
      await new ClasificadorCompatibleOpenAI({
        apiKey: 'clave',
        urlBase,
        modelo: 'm',
        fetch,
        desactivarRazonamiento: true,
      }).clasificar('F', 'S', 'C', CANDIDATOS);
      assertEquals(await cuerpoEnviado(llamadas), base, urlBase);
    }
  },
);

Deno.test('compatible con OpenAI: sin desactivar razonamiento no cambia la petición', async () => {
  for (const [urlBase] of OPENAI_POR_HOST) {
    const { fetch, llamadas } = crearFetchGuionado([respuestaChat()]);
    await new ClasificadorCompatibleOpenAI({
      apiKey: 'clave',
      urlBase,
      modelo: 'm',
      fetch,
      desactivarRazonamiento: false,
    }).clasificar('F', 'S', 'C', CANDIDATOS);
    const texto = JSON.stringify(await cuerpoEnviado(llamadas));
    assert(!texto.includes('reasoning') && !texto.includes('thinking'), urlBase);
  }
});

Deno.test(
  'dependencias: la configuración de desactivar razonamiento llega al clasificador',
  async () => {
    for (const [variable, esperado] of [
      ['true', true],
      ['false', false],
    ] as const) {
      const { fetch, llamadas } = crearFetchGuionado([respuestaChat()]);
      const entorno: Record<string, string> = {
        LLM_PROVIDER: 'openai',
        OPENAI_COMPAT_BASE_URL: 'https://openrouter.ai/api/v1',
        OPENAI_COMPAT_MODEL: 'm',
        OPENAI_COMPAT_API_KEY: 'clave',
        LLM_DESACTIVAR_RAZONAMIENTO: variable,
      };
      const deps = crearDependencias(
        (nombre) => entorno[nombre],
        { repositorio: new RepositorioMemoria(), verificador: verificadorFalso },
        { fetch, ahora: () => 0, esperar: () => Promise.resolve() },
      );
      await deps.clasificador('m').clasificar('F', 'S', 'C', CANDIDATOS);
      assertEquals('reasoning' in (await cuerpoEnviado(llamadas)), esperado);
    }

    const { fetch, llamadas } = crearFetchGuionado([respuestaGemini()]);
    const gemini = crearDependencias(
      (nombre) =>
        ({
          LLM_PROVIDER: 'gemini',
          GEMINI_API_KEY: 'clave',
          LLM_DESACTIVAR_RAZONAMIENTO: 'true',
        })[nombre],
      { repositorio: new RepositorioMemoria(), verificador: verificadorFalso },
      { fetch, ahora: () => 0, esperar: () => Promise.resolve() },
    );
    await gemini.clasificador('m').clasificar('F', 'S', 'C', CANDIDATOS);
    assert(JSON.stringify(await cuerpoEnviado(llamadas)).includes('thinkingBudget'));
  },
);

// S16c: corte al leer el cuerpo ---------------------------------------------------------------

Deno.test(
  'IA: si pasan los 45 s mientras se lee el cuerpo también dice que tardó demasiado',
  async () => {
    const original = AbortSignal.timeout;
    let control = new AbortController();
    // La señal propia de la llamada dura 45 s reales: aquí la controla la prueba.
    AbortSignal.timeout = (() =>
      (control = new AbortController()).signal) as typeof AbortSignal.timeout;
    // Llegan las cabeceras, pero el cuerpo no termina: se agota la señal y el cuerpo falla.
    const fetchConCuerpoLento = ((_entrada: RequestInfo | URL, init?: RequestInit) => {
      const cuerpo = new ReadableStream({
        start(c) {
          init?.signal?.addEventListener('abort', () =>
            c.error(new DOMException('t', 'TimeoutError')),
          );
        },
      });
      queueMicrotask(() => control.abort());
      return Promise.resolve(new Response(cuerpo, { status: 200 }));
    }) as typeof fetch;
    try {
      for (const clasificador of [
        new GeminiClasificador({ apiKey: 'c', modelo: 'm', fetch: fetchConCuerpoLento }),
        new ClasificadorCompatibleOpenAI({
          apiKey: 'c',
          urlBase: 'https://proveedor.example/v1',
          modelo: 'm',
          fetch: fetchConCuerpoLento,
        }),
      ]) {
        const error = await assertRejects(
          () => clasificador.clasificar('F', 'S', 'C', CANDIDATOS),
          ErrorProveedorNoDisponible,
        );
        assertEquals(error.message, MENSAJE_IA_TARDO);
      }
    } finally {
      AbortSignal.timeout = original;
    }
  },
);

// S16d: tokens y reintentos por tanda ---------------------------------------------------------

Deno.test('Gemini: anota los tokens de usageMetadata en la medición de la llamada', async () => {
  const { fetch } = crearFetchGuionado([
    respuestaGemini({
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 200 },
    }),
  ]);
  const medicion = medicionVacia();
  await new GeminiClasificador({ apiKey: 'c', modelo: 'm', fetch }).clasificar(
    'F',
    'S',
    'C',
    CANDIDATOS,
    medicion,
  );
  assertEquals(medicion, {
    reintentos: 0,
    tokensEntrada: 120,
    tokensSalida: 30,
    tokensRazonamiento: 200,
  });
});

Deno.test(
  'compatible con OpenAI: anota los tokens de usage en la medición de la llamada',
  async () => {
    const { fetch } = crearFetchGuionado([
      respuestaChat({
        usage: {
          prompt_tokens: 80,
          completion_tokens: 250,
          completion_tokens_details: { reasoning_tokens: 190 },
        },
      }),
    ]);
    const medicion = medicionVacia();
    await new ClasificadorCompatibleOpenAI({
      apiKey: 'c',
      urlBase: 'https://proveedor.example/v1',
      modelo: 'm',
      fetch,
    }).clasificar('F', 'S', 'C', CANDIDATOS, medicion);
    assertEquals(medicion, {
      reintentos: 0,
      tokensEntrada: 80,
      tokensSalida: 250,
      tokensRazonamiento: 190,
    });
  },
);

Deno.test('tokens: lo que el proveedor no informa o no es un entero queda en null', async () => {
  const casos: [string, Record<string, unknown>][] = [
    ['sin usage', {}],
    ['usage vacío', { usage: {} }],
    ['textos', { usage: { prompt_tokens: '80', completion_tokens: 'mucho' } }],
    ['negativos y decimales', { usage: { prompt_tokens: -1, completion_tokens: 2.5 } }],
    ['no es objeto', { usage: 7 }],
  ];
  for (const [nombre, extra] of casos) {
    const { fetch } = crearFetchGuionado([respuestaChat(extra)]);
    const medicion = medicionVacia();
    await new ClasificadorCompatibleOpenAI({
      apiKey: 'c',
      urlBase: 'https://proveedor.example/v1',
      modelo: 'm',
      fetch,
    }).clasificar('F', 'S', 'C', CANDIDATOS, medicion);
    assertEquals(
      [medicion.tokensEntrada, medicion.tokensSalida, medicion.tokensRazonamiento],
      [null, null, null],
      nombre,
    );
  }
  // Solo algunos campos: los que faltan quedan en null, los demás se conservan.
  const { fetch } = crearFetchGuionado([respuestaChat({ usage: { prompt_tokens: 12 } })]);
  const medicion = medicionVacia();
  await new ClasificadorCompatibleOpenAI({
    apiKey: 'c',
    urlBase: 'https://proveedor.example/v1',
    modelo: 'm',
    fetch,
  }).clasificar('F', 'S', 'C', CANDIDATOS, medicion);
  assertEquals(
    [medicion.tokensEntrada, medicion.tokensSalida, medicion.tokensRazonamiento],
    [12, null, null],
  );
});

Deno.test('medición: cuenta los reintentos de ESTA llamada, aun cuando falla', async () => {
  const limite = () => respuestaJson({ error: { message: 'cuota' } }, 429);
  for (const [guion, falla] of [
    [[limite(), limite(), respuestaChat()], false],
    [[limite(), limite(), limite(), limite()], true],
  ] as const) {
    const reloj = crearRelojFalso();
    const { fetch } = crearFetchGuionado([...guion]);
    const clasificador = new ClasificadorCompatibleOpenAI({
      apiKey: 'c',
      urlBase: 'https://proveedor.example/v1',
      modelo: 'm',
      fetch,
      ritmo: new RitmoDeLlamadas({ ahora: reloj.ahora, esperar: (ms) => reloj.esperar(ms) }, 600),
    });
    const medicion = medicionVacia();
    const llamada = clasificador.clasificar('F', 'S', 'C', CANDIDATOS, medicion);
    if (falla) await assertRejects(() => llamada, ErrorProveedorNoDisponible);
    else await llamada;
    assertEquals(medicion.reintentos, falla ? 3 : 2);
  }
});
