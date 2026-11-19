import { assertEquals, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1';
import {
  combinarConEntorno,
  leerConfiguracion,
  leerOrigenes,
  modeloDelProveedor,
} from './configuracion.ts';
import { ErrorApi } from './errores.ts';

function entorno(valores: Record<string, string>) {
  return (nombre: string) => valores[nombre];
}

Deno.test('configuración: valores por defecto de BRIEF §13.7', () => {
  const config = leerConfiguracion(entorno({}));
  assertEquals(config.proveedorLlm, 'gemini');
  assertEquals(config.modelo, 'gemini-3.1-flash-lite');
  assertEquals(config.umbral, 0.7);
  assertEquals(config.maxCandidatos, 50);
  assertEquals(config.llamadasPorMinuto, 15);
  assertEquals(config.openalexApiKey, undefined);
});

Deno.test('configuración: lee las variables y trata una cadena vacía como ausente', () => {
  const config = leerConfiguracion(
    entorno({
      LLM_PROVIDER: 'fake',
      LLM_MODEL: 'otro-modelo',
      LLM_UMBRAL: '0.85',
      RECALCULO_MAX_CANDIDATOS: '15',
      LLM_LLAMADAS_POR_MINUTO: '30',
      OPENALEX_API_KEY: 'k1',
      GEMINI_API_KEY: '',
      CROSSREF_MAILTO: 'equipo@ejemplo.org',
    }),
  );
  assertEquals(config.proveedorLlm, 'fake');
  assertEquals(config.modelo, 'otro-modelo');
  assertEquals(config.umbral, 0.85);
  assertEquals(config.maxCandidatos, 15);
  assertEquals(config.llamadasPorMinuto, 30);
  assertEquals(config.openalexApiKey, 'k1');
  assertEquals(config.geminiApiKey, undefined);
  assertEquals(config.crossrefMailto, 'equipo@ejemplo.org');
});

Deno.test('configuración: un valor inválido da 500 con el nombre de la variable', () => {
  for (const [variable, valor] of [
    ['LLM_PROVIDER', 'otro'],
    ['LLM_UMBRAL', '1.5'],
    ['LLM_UMBRAL', 'alto'],
    ['LLM_UMBRAL', '-0.1'],
    ['RECALCULO_MAX_CANDIDATOS', '0'],
    ['RECALCULO_MAX_CANDIDATOS', '2.5'],
    ['RECALCULO_MAX_CANDIDATOS', '1000'],
    ['LLM_LLAMADAS_POR_MINUTO', '0'],
    ['LLM_LLAMADAS_POR_MINUTO', '1001'],
    ['LLM_LLAMADAS_POR_MINUTO', '2.5'],
    ['LLM_LLAMADAS_POR_MINUTO', 'muchas'],
    ['LLM_LLAMADAS_POR_MINUTO', '-3'],
    ['LLM_MODEL', '../otro:generateContent?x='],
    ['LLM_MODEL', 'modelo con espacios'],
    ['LLM_MODEL', 'x'.repeat(101)],
  ] as const) {
    const error = assertThrows(() => leerConfiguracion(entorno({ [variable]: valor })), ErrorApi);
    assertEquals([error.estado, error.codigo], [500, 'configuracion_invalida']);
    assertStringIncludes(error.message, variable);
  }
});

Deno.test('configuración: LLM_LLAMADAS_POR_MINUTO admite los extremos 1 y 1000', () => {
  for (const [texto, esperado] of [
    ['1', 1],
    ['1000', 1000],
  ] as const) {
    const config = leerConfiguracion(entorno({ LLM_LLAMADAS_POR_MINUTO: texto }));
    assertEquals(config.llamadasPorMinuto, esperado);
  }
});

Deno.test(
  'orígenes permitidos: por defecto el servidor de desarrollo; si no, la lista configurada',
  () => {
    assertEquals(leerOrigenes(entorno({})), ['http://localhost:5173', 'http://127.0.0.1:5173']);
    assertEquals(
      leerOrigenes(
        entorno({ ORIGENES_PERMITIDOS: 'https://guios.vercel.app, http://localhost:5173 ,' }),
      ),
      ['https://guios.vercel.app', 'http://localhost:5173'],
    );
  },
);

Deno.test('configuración guardada: lo de la base manda; lo que falta sale del entorno', () => {
  const leer = combinarConEntorno(
    {
      proveedor_llm: 'gemini',
      modelo: null,
      umbral: 0.8,
      max_candidatos: 15,
      llamadas_por_minuto: 30,
      crossref_mailto: '',
      gemini_api_key: 'k-base',
      openalex_api_key: null,
    },
    entorno({
      LLM_PROVIDER: 'fake',
      LLM_MODEL: 'modelo-entorno',
      LLM_UMBRAL: '0.5',
      LLM_LLAMADAS_POR_MINUTO: '10',
      CROSSREF_MAILTO: 'entorno@ejemplo.org',
      OPENALEX_API_KEY: 'k-entorno',
      GEMINI_API_KEY: 'k-gemini-entorno',
    }),
  );
  const config = leerConfiguracion(leer);
  assertEquals(config.proveedorLlm, 'gemini');
  assertEquals(config.modelo, 'modelo-entorno');
  assertEquals(config.umbral, 0.8);
  assertEquals(config.maxCandidatos, 15);
  assertEquals(config.llamadasPorMinuto, 30);
  assertEquals(config.crossrefMailto, 'entorno@ejemplo.org');
  assertEquals(config.geminiApiKey, 'k-base');
  assertEquals(config.openalexApiKey, 'k-entorno');
});

Deno.test('configuración guardada: sin llamadas_por_minuto en la base manda el entorno', () => {
  for (const guardada of [{ llamadas_por_minuto: null }, {}]) {
    const config = leerConfiguracion(
      combinarConEntorno(guardada, entorno({ LLM_LLAMADAS_POR_MINUTO: '20' })),
    );
    assertEquals(config.llamadasPorMinuto, 20);
  }
});

Deno.test('configuración guardada: sin fila en la base se usa solo el entorno', () => {
  const config = leerConfiguracion(combinarConEntorno(null, entorno({ LLM_PROVIDER: 'fake' })));
  assertEquals(config.proveedorLlm, 'fake');
  assertEquals(config.umbral, 0.7);
});

Deno.test('configuración guardada: ORIGENES_PERMITIDOS nunca sale de la base', () => {
  const leer = combinarConEntorno(
    { ORIGENES_PERMITIDOS: 'https://malicioso.example' } as never,
    entorno({}),
  );
  assertEquals(leer('ORIGENES_PERMITIDOS'), undefined);
  assertEquals(leerOrigenes(leer), ['http://localhost:5173', 'http://127.0.0.1:5173']);
});

Deno.test('configuración guardada: un valor inválido de la base también da 500', () => {
  for (const guardada of [
    { umbral: 1.5 },
    { max_candidatos: 0 },
    { proveedor_llm: 'otro' },
    { llamadas_por_minuto: 0 },
    { llamadas_por_minuto: 1001 },
  ]) {
    const error = assertThrows(
      () => leerConfiguracion(combinarConEntorno(guardada, entorno({}))),
      ErrorApi,
    );
    assertEquals([error.estado, error.codigo], [500, 'configuracion_invalida']);
  }
});

// Proveedor «compatible con OpenAI» (issue #40) ------------------------------------------------

const OPENAI = {
  LLM_PROVIDER: 'openai',
  OPENAI_COMPAT_BASE_URL: 'https://openrouter.ai/api/v1',
  OPENAI_COMPAT_MODEL: 'meta-llama/llama-3.3-70b-instruct:free',
  OPENAI_COMPAT_API_KEY: 'sk-or-prueba',
};

Deno.test('configuración openai: lee dirección base, modelo y clave', () => {
  const config = leerConfiguracion(entorno(OPENAI));
  assertEquals(config.proveedorLlm, 'openai');
  assertEquals(config.openaiBaseUrl, 'https://openrouter.ai/api/v1');
  assertEquals(config.openaiModelo, 'meta-llama/llama-3.3-70b-instruct:free');
  assertEquals(config.openaiApiKey, 'sk-or-prueba');
  assertEquals(modeloDelProveedor(config), 'meta-llama/llama-3.3-70b-instruct:free');
});

Deno.test(
  'configuración openai: sin los datos del proveedor no falla al leer (se pide al usarlo)',
  () => {
    const config = leerConfiguracion(entorno({ LLM_PROVIDER: 'openai' }));
    assertEquals(config.openaiBaseUrl, undefined);
    assertEquals(config.openaiModelo, undefined);
    assertEquals(config.openaiApiKey, undefined);
    assertEquals(modeloDelProveedor(config), '');
  },
);

Deno.test('configuración openai: normaliza la dirección base (sin «/» final ni espacios)', () => {
  for (const [texto, esperada] of [
    ['https://api.groq.com/openai/v1/', 'https://api.groq.com/openai/v1'],
    ['  https://api.deepseek.com  ', 'https://api.deepseek.com'],
    ['https://api.deepseek.com/', 'https://api.deepseek.com'],
    ['https://api.mistral.ai/v1//', 'https://api.mistral.ai/v1'],
    ['https://servidor.ejemplo.org:8443/v1', 'https://servidor.ejemplo.org:8443/v1'],
  ] as const) {
    const config = leerConfiguracion(entorno({ ...OPENAI, OPENAI_COMPAT_BASE_URL: texto }));
    assertEquals(config.openaiBaseUrl, esperada);
  }
});

Deno.test('configuración openai: rechaza direcciones base que no sean https limpias', () => {
  for (const direccion of [
    'http://api.groq.com/openai/v1',
    'ftp://api.groq.com/v1',
    'api.groq.com/openai/v1',
    'https://jose:secreto123@api.groq.com/v1',
    'https://secreto123@api.groq.com/v1',
    'https://api.groq.com/v1?api_key=abc',
    'https://api.groq.com/v1?',
    'https://api.groq.com/v1#parte',
    'https://api.groq.com/v1 con espacios',
    'https://',
    'https:///v1',
    'https://api.groq.com\\v1',
    `https://ejemplo.com/${'a'.repeat(200)}`,
  ]) {
    const error = assertThrows(
      () => leerConfiguracion(entorno({ ...OPENAI, OPENAI_COMPAT_BASE_URL: direccion })),
      ErrorApi,
      'OPENAI_COMPAT_BASE_URL',
    );
    assertEquals([error.estado, error.codigo], [500, 'configuracion_invalida']);
    // El mensaje nunca repite la dirección: podría llevar credenciales.
    assertEquals(error.message.includes('secreto123'), false);
    assertEquals(error.message.includes('api.groq.com'), false);
  }
});

Deno.test(
  'configuración openai: el modelo admite «/», «:», «@» y no pasa de 150 caracteres',
  () => {
    for (const modelo of [
      'gpt-4o-mini',
      'meta-llama/llama-3.3-70b-instruct:free',
      'accounts/fireworks/models/llama-v3p1-8b-instruct',
      '@cf/meta/llama-3.1-8b-instruct',
      'x'.repeat(150),
    ]) {
      assertEquals(
        leerConfiguracion(entorno({ ...OPENAI, OPENAI_COMPAT_MODEL: modelo })).openaiModelo,
        modelo,
      );
    }
    for (const modelo of ['con espacios', 'comilla"', 'salto\nlinea', 'x'.repeat(151), 'ñandú']) {
      const error = assertThrows(
        () => leerConfiguracion(entorno({ ...OPENAI, OPENAI_COMPAT_MODEL: modelo })),
        ErrorApi,
        'OPENAI_COMPAT_MODEL',
      );
      assertEquals([error.estado, error.codigo], [500, 'configuracion_invalida']);
    }
  },
);

Deno.test(
  'configuración openai: con otro proveedor no se validan ni se exigen sus variables',
  () => {
    for (const proveedor of ['gemini', 'fake']) {
      const config = leerConfiguracion(
        entorno({ LLM_PROVIDER: proveedor, OPENAI_COMPAT_BASE_URL: 'http://inválida' }),
      );
      assertEquals(config.proveedorLlm, proveedor);
    }
  },
);

Deno.test('configuración guardada openai: lo de la base manda y lo demás sale del entorno', () => {
  const config = leerConfiguracion(
    combinarConEntorno(
      {
        proveedor_llm: 'openai',
        openai_base_url: 'https://api.groq.com/openai/v1/',
        openai_modelo: 'llama-3.3-70b-versatile',
        openai_compat_api_key: 'k-base',
      },
      entorno({
        OPENAI_COMPAT_BASE_URL: 'https://otra.example/v1',
        OPENAI_COMPAT_MODEL: 'modelo-entorno',
        OPENAI_COMPAT_API_KEY: 'k-entorno',
      }),
    ),
  );
  assertEquals(config.openaiBaseUrl, 'https://api.groq.com/openai/v1');
  assertEquals(config.openaiModelo, 'llama-3.3-70b-versatile');
  assertEquals(config.openaiApiKey, 'k-base');

  const delEntorno = leerConfiguracion(
    combinarConEntorno(
      {
        proveedor_llm: 'openai',
        openai_base_url: null,
        openai_modelo: '',
        openai_compat_api_key: null,
      },
      entorno({
        OPENAI_COMPAT_BASE_URL: 'https://otra.example/v1',
        OPENAI_COMPAT_MODEL: 'modelo-entorno',
        OPENAI_COMPAT_API_KEY: 'k-entorno',
      }),
    ),
  );
  assertEquals(delEntorno.openaiBaseUrl, 'https://otra.example/v1');
  assertEquals(delEntorno.openaiModelo, 'modelo-entorno');
  assertEquals(delEntorno.openaiApiKey, 'k-entorno');
});

Deno.test('configuración guardada openai: una dirección inválida de la base también da 500', () => {
  const error = assertThrows(
    () =>
      leerConfiguracion(
        combinarConEntorno(
          { proveedor_llm: 'openai', openai_base_url: 'http://api.groq.com/v1' },
          entorno({}),
        ),
      ),
    ErrorApi,
  );
  assertEquals([error.estado, error.codigo], [500, 'configuracion_invalida']);
});
