import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { atender } from './http.ts';
import { iniciar } from './recalculo_iniciar.ts';
import { VERSION_PROMPT } from './clasificador.ts';
import { CONFIGURACION_PRUEBA, crearDependenciasPrueba } from './pruebas_recalculo.ts';
import { TOKEN_ADMIN, TOKEN_DECISOR } from './pruebas.ts';

function llamar(
  dependencias: ReturnType<typeof crearDependenciasPrueba>,
  cuerpo: unknown,
  token: string | null = TOKEN_ADMIN,
) {
  return atender(
    new Request('http://localhost/functions/v1/recalculo-iniciar', {
      method: 'POST',
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpo),
    }),
    { origenes: [], crear: () => dependencias },
    (entrada, admin, deps) => iniciar(entrada, admin, deps),
  );
}

const ENTRADA = { anio_inicio: 2020, anio_fin: 2025, fuentes: ['openalex', 'crossref'] };

Deno.test(
  'iniciar: crea el cálculo en_proceso con un paso pendiente por subfactor y devuelve {id_calculo}',
  async () => {
    const deps = crearDependenciasPrueba();

    const respuesta = await llamar(deps, ENTRADA);

    assertEquals(respuesta.status, 200);
    const { id_calculo } = await respuesta.json();
    assertEquals(typeof id_calculo, 'number');

    const calculo = deps.repositorio.calculos.get(id_calculo)!;
    assertEquals(calculo.estado, 'en_proceso');
    assertEquals(calculo.origen, 'ia');
    assertEquals([calculo.anio_inicio, calculo.anio_fin], [2020, 2025]);
    assertEquals(calculo.bases_datos, 'OpenAlex, Crossref');
    assertEquals(calculo.creado_por, 'id-admin');
    assertEquals(calculo.progreso, 0);

    const pasos = deps.repositorio.pasos.get(id_calculo)!;
    assertEquals([...pasos.keys()], [11, 12, 21, 31, 32]);
    assert([...pasos.values()].every((p) => p.estado === 'pendiente'));
  },
);

Deno.test(
  'iniciar: guarda los parámetros del cálculo para poder reproducirlo (RNF-09)',
  async () => {
    const deps = crearDependenciasPrueba({
      configuracion: {
        ...CONFIGURACION_PRUEBA,
        umbral: 0.8,
        maxCandidatos: 15,
        modelo: 'gemini-x',
        proveedorLlm: 'gemini',
      },
    });
    const { id_calculo } = await (await llamar(deps, ENTRADA)).json();

    assertEquals(deps.repositorio.calculos.get(id_calculo)!.parametros, {
      anio_inicio: 2020,
      anio_fin: 2025,
      fuentes: ['openalex', 'crossref'],
      umbral: 0.8,
      modelo: 'gemini-x',
      proveedor_llm: 'gemini',
      version_prompt: VERSION_PROMPT,
      max_candidatos: 15,
    });
  },
);

Deno.test('iniciar: con LLM_PROVIDER=fake el modelo registrado es «fake»', async () => {
  const deps = crearDependenciasPrueba({
    configuracion: {
      ...CONFIGURACION_PRUEBA,
      modelo: 'gemini-3.1-flash-lite',
      proveedorLlm: 'fake',
    },
  });
  const { id_calculo } = await (await llamar(deps, ENTRADA)).json();
  const parametros = deps.repositorio.calculos.get(id_calculo)!.parametros!;
  assertEquals([parametros.proveedor_llm, parametros.modelo], ['fake', 'fake']);
});

Deno.test('iniciar: quita las fuentes repetidas y acepta una sola', async () => {
  const deps = crearDependenciasPrueba();
  const { id_calculo } = await (
    await llamar(deps, { ...ENTRADA, fuentes: ['crossref', 'crossref'] })
  ).json();
  const calculo = deps.repositorio.calculos.get(id_calculo)!;
  assertEquals(calculo.parametros?.fuentes, ['crossref']);
  assertEquals(calculo.bases_datos, 'Crossref');
});

Deno.test('iniciar: un decisor recibe 403 y no se crea nada', async () => {
  const deps = crearDependenciasPrueba();
  const respuesta = await llamar(deps, ENTRADA, TOKEN_DECISOR);
  assertEquals(respuesta.status, 403);
  assertEquals((await respuesta.json()).codigo, 'solo_administrador');
  assertEquals(deps.repositorio.calculos.size, 0);
});

Deno.test('iniciar: sin sesión recibe 401 y no se crea nada', async () => {
  const deps = crearDependenciasPrueba();
  const respuesta = await llamar(deps, ENTRADA, null);
  assertEquals(respuesta.status, 401);
  assertEquals(deps.repositorio.calculos.size, 0);
});

Deno.test('iniciar: valida la entrada con mensajes en español', async () => {
  const casos: [unknown, string][] = [
    [null, 'solicitud'],
    [{}, 'anio_inicio'],
    [{ ...ENTRADA, anio_inicio: '2020' }, 'anio_inicio'],
    [{ ...ENTRADA, anio_fin: 2025.5 }, 'anio_fin'],
    [{ ...ENTRADA, anio_inicio: 1800 }, 'anio_inicio'],
    [{ ...ENTRADA, anio_fin: 2500 }, 'anio_fin'],
    [{ ...ENTRADA, anio_inicio: 2026, anio_fin: 2020 }, 'no puede ser mayor'],
    [{ ...ENTRADA, fuentes: [] }, 'fuentes'],
    [{ ...ENTRADA, fuentes: 'openalex' }, 'fuentes'],
    [{ ...ENTRADA, fuentes: ['scopus'] }, 'scopus'],
    [{ ...ENTRADA, fuentes: ['openalex', 3] }, 'fuentes'],
  ];
  for (const [cuerpo, texto] of casos) {
    const deps = crearDependenciasPrueba();
    const respuesta = await llamar(deps, cuerpo);
    assertEquals(respuesta.status, 400, JSON.stringify(cuerpo));
    const resultado = await respuesta.json();
    assertEquals(resultado.codigo, 'solicitud_invalida');
    assertStringIncludes(resultado.error, texto);
    assertEquals(deps.repositorio.calculos.size, 0, 'no se crea un cálculo con entrada inválida');
  }
});

Deno.test(
  'iniciar: si falla la creación no queda ningún cálculo (cálculo y pasos son atómicos)',
  async () => {
    const deps = crearDependenciasPrueba();
    deps.repositorio.fallarAlCrear = true;

    const respuesta = await llamar(deps, ENTRADA);

    assertEquals(respuesta.status, 500);
    assertEquals((await respuesta.json()).codigo, 'error_interno');
    assertEquals(deps.repositorio.calculos.size, 0, 'no queda un cálculo huérfano');
    assertEquals(deps.repositorio.pasos.size, 0);
  },
);

Deno.test('iniciar: con el catálogo vacío responde 500 catalogo_vacio y no crea nada', async () => {
  const deps = crearDependenciasPrueba();
  deps.repositorio.subfactores.length = 0;
  const respuesta = await llamar(deps, ENTRADA);
  assertEquals(respuesta.status, 500);
  assertEquals((await respuesta.json()).codigo, 'catalogo_vacio');
  assertEquals(deps.repositorio.calculos.size, 0);
});
