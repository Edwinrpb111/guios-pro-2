import { assertEquals, assertStringIncludes, assertThrows } from 'jsr:@std/assert@1';
import { leerConfiguracion } from './configuracion.ts';
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
  assertEquals(config.origenesPermitidos, ['http://localhost:5173', 'http://127.0.0.1:5173']);
  assertEquals(config.openalexApiKey, undefined);
});

Deno.test('configuración: lee las variables y trata una cadena vacía como ausente', () => {
  const config = leerConfiguracion(
    entorno({
      LLM_PROVIDER: 'fake',
      LLM_MODEL: 'otro-modelo',
      LLM_UMBRAL: '0.85',
      RECALCULO_MAX_CANDIDATOS: '15',
      OPENALEX_API_KEY: 'k1',
      GEMINI_API_KEY: '',
      CROSSREF_MAILTO: 'equipo@ejemplo.org',
      ORIGENES_PERMITIDOS: 'https://guios.vercel.app, http://localhost:5173 ,',
    }),
  );
  assertEquals(config.proveedorLlm, 'fake');
  assertEquals(config.modelo, 'otro-modelo');
  assertEquals(config.umbral, 0.85);
  assertEquals(config.maxCandidatos, 15);
  assertEquals(config.openalexApiKey, 'k1');
  assertEquals(config.geminiApiKey, undefined);
  assertEquals(config.crossrefMailto, 'equipo@ejemplo.org');
  assertEquals(config.origenesPermitidos, ['https://guios.vercel.app', 'http://localhost:5173']);
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
  ] as const) {
    const error = assertThrows(() => leerConfiguracion(entorno({ [variable]: valor })), ErrorApi);
    assertEquals([error.estado, error.codigo], [500, 'configuracion_invalida']);
    assertStringIncludes(error.message, variable);
  }
});
