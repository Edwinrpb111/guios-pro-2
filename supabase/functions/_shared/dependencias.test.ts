import { assert, assertEquals, assertInstanceOf, assertStringIncludes } from 'jsr:@std/assert@1';
import { GeminiClasificador } from './clasificador.ts';
import { CrossrefProveedor } from './crossref.ts';
import { crearDependencias } from './dependencias.ts';
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
