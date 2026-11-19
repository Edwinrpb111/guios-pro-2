import { assertEquals, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1';
import { combinarConEntorno, leerConfiguracion, leerOrigenes } from './configuracion.ts';
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
    ['LLM_PROVIDER', 'openai'],
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
    { proveedor_llm: 'openai' },
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
