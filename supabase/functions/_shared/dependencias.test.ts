import {
  assert,
  assertEquals,
  assertInstanceOf,
  assertRejects,
  assertStringIncludes,
} from 'jsr:@std/assert@1';
import { GeminiClasificador } from './clasificador.ts';
import { ClasificadorCompatibleOpenAI } from './clasificador_openai.ts';
import { CrossrefProveedor } from './crossref.ts';
import { crearDependencias, crearDependenciasConBase } from './dependencias.ts';
import { ErrorApi } from './errores.ts';
import { ClasificadorFalso, ProveedorFalso } from './falsos.ts';
import { OpenAlexProveedor } from './openalex.ts';
import { RepositorioMemoria } from './pruebas_recalculo.ts';
import { verificadorFalso } from './pruebas.ts';

const INFRA = { repositorio: new RepositorioMemoria(), verificador: verificadorFalso };

function crear(variables: Record<string, string>) {
  return crearDependencias((nombre) => variables[nombre], INFRA);
}

Deno.test('LLM_PROVIDER=fake: proveedores y clasificador falsos, sin claves ni red', () => {
  const deps = crear({ LLM_PROVIDER: 'fake' });

  const proveedores = deps.proveedores(['openalex', 'crossref']);
  assertEquals(
    proveedores.map((p) => p.nombre),
    ['openalex', 'crossref'],
  );
  for (const p of proveedores) assertInstanceOf(p, ProveedorFalso);
  assertInstanceOf(deps.clasificador('cualquiera'), ClasificadorFalso);
  assertEquals(deps.configuracion.proveedorLlm, 'fake');
});

Deno.test('con proveedor real: OpenAlex, Crossref y Gemini con sus claves', () => {
  const deps = crear({
    LLM_PROVIDER: 'gemini',
    OPENALEX_API_KEY: 'k-openalex',
    GEMINI_API_KEY: 'k-gemini',
    CROSSREF_MAILTO: 'equipo@ejemplo.org',
  });
  const [openalex, crossref] = deps.proveedores(['openalex', 'crossref']);
  assertInstanceOf(openalex, OpenAlexProveedor);
  assertInstanceOf(crossref, CrossrefProveedor);
  assertInstanceOf(deps.clasificador('gemini-3.1-flash-lite'), GeminiClasificador);
});

Deno.test('Crossref no exige clave ni correo; OpenAlex y Gemini sí, con un mensaje claro', () => {
  assertInstanceOf(
    crear({ LLM_PROVIDER: 'gemini' }).proveedores(['crossref'])[0],
    CrossrefProveedor,
  );

  for (const [variables, llamar, secreto] of [
    [
      { LLM_PROVIDER: 'gemini' },
      (d: ReturnType<typeof crear>) => d.proveedores(['openalex']),
      'OPENALEX_API_KEY',
    ],
    [
      { LLM_PROVIDER: 'gemini' },
      (d: ReturnType<typeof crear>) => d.clasificador('m'),
      'GEMINI_API_KEY',
    ],
  ] as const) {
    try {
      llamar(crear(variables));
      assert(false, 'debía fallar');
    } catch (error) {
      assertInstanceOf(error, ErrorApi);
      assertEquals([error.estado, error.codigo], [500, 'configuracion_incompleta']);
      assertStringIncludes(error.message, secreto);
    }
  }
});

Deno.test('con LLM_PROVIDER=fake no se piden claves aunque se usen OpenAlex y Gemini', () => {
  const deps = crear({ LLM_PROVIDER: 'fake' });
  deps.proveedores(['openalex']);
  deps.clasificador('gemini-3.1-flash-lite');
});

Deno.test('con la base: la configuración guardada se lee en cada petición y manda', async () => {
  let lecturas = 0;
  const guardadas = [
    { proveedor_llm: 'gemini', gemini_api_key: 'k-base', umbral: 0.9 },
    { proveedor_llm: 'fake' },
  ];
  const infraestructura = {
    ...INFRA,
    configuracionGuardada: () => Promise.resolve(guardadas[lecturas++] ?? null),
  };
  const leer = (nombre: string) => ({ LLM_PROVIDER: 'fake', LLM_UMBRAL: '0.5' })[nombre];

  const primera = await crearDependenciasConBase(leer, infraestructura);
  assertEquals(primera.configuracion.proveedorLlm, 'gemini');
  assertEquals(primera.configuracion.umbral, 0.9);
  assertInstanceOf(primera.clasificador('m'), GeminiClasificador);

  const segunda = await crearDependenciasConBase(leer, infraestructura);
  assertEquals(segunda.configuracion.proveedorLlm, 'fake');
  assertEquals(segunda.configuracion.umbral, 0.5);
  assertEquals(lecturas, 2);
});

Deno.test('con la base: si no se puede leer la configuración, la petición falla', async () => {
  const infraestructura = {
    ...INFRA,
    configuracionGuardada: () => Promise.reject(new Error('base caída')),
  };
  await assertRejects(() => crearDependenciasConBase(() => undefined, infraestructura), Error);
});

Deno.test('LLM_PROVIDER=openai: OpenAlex, Crossref y el clasificador compatible con OpenAI', () => {
  const deps = crear({
    LLM_PROVIDER: 'openai',
    OPENALEX_API_KEY: 'k-openalex',
    OPENAI_COMPAT_BASE_URL: 'https://openrouter.ai/api/v1',
    OPENAI_COMPAT_MODEL: 'meta-llama/llama-3.3-70b-instruct:free',
    OPENAI_COMPAT_API_KEY: 'k-compat',
  });
  const [openalex, crossref] = deps.proveedores(['openalex', 'crossref']);
  assertInstanceOf(openalex, OpenAlexProveedor);
  assertInstanceOf(crossref, CrossrefProveedor);
  assertInstanceOf(
    deps.clasificador('meta-llama/llama-3.3-70b-instruct:free'),
    ClasificadorCompatibleOpenAI,
  );
});

Deno.test('LLM_PROVIDER=openai sin clave no pide la de Gemini y nombra la que falta', () => {
  const completo = {
    LLM_PROVIDER: 'openai',
    OPENAI_COMPAT_BASE_URL: 'https://openrouter.ai/api/v1',
    OPENAI_COMPAT_MODEL: 'modelo',
    OPENAI_COMPAT_API_KEY: 'k-compat',
    GEMINI_API_KEY: 'k-gemini',
  };
  for (const faltante of [
    'OPENAI_COMPAT_BASE_URL',
    'OPENAI_COMPAT_API_KEY',
    'OPENAI_COMPAT_MODEL',
  ] as const) {
    const variables: Record<string, string> = { ...completo, [faltante]: '' };
    try {
      crear(variables).clasificador(variables.OPENAI_COMPAT_MODEL ?? '');
      assert(false, 'debía fallar');
    } catch (error) {
      assertInstanceOf(error, ErrorApi);
      assertEquals([error.estado, error.codigo], [500, 'configuracion_incompleta']);
      assertStringIncludes(error.message, faltante);
    }
  }
  // Con Gemini la clave de OPENAI_COMPAT no cuenta.
  assertInstanceOf(
    crear({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }).clasificador('m'),
    GeminiClasificador,
  );
});

Deno.test('con la base: el proveedor openai y su clave guardados se usan sin entorno', async () => {
  const infraestructura = {
    ...INFRA,
    configuracionGuardada: () =>
      Promise.resolve({
        proveedor_llm: 'openai',
        openai_base_url: 'https://api.groq.com/openai/v1',
        openai_modelo: 'llama-3.3-70b-versatile',
        openai_compat_api_key: 'k-base',
      }),
  };
  const deps = await crearDependenciasConBase(() => undefined, infraestructura);
  assertEquals(deps.configuracion.proveedorLlm, 'openai');
  assertInstanceOf(deps.clasificador('llama-3.3-70b-versatile'), ClasificadorCompatibleOpenAI);
});
