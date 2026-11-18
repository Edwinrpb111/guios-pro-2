import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { aceptarVeredictos } from './clasificador.ts';
import { esDoiValido } from './doi.ts';
import { ClasificadorFalso, ProveedorFalso } from './falsos.ts';

Deno.test('ProveedorFalso: es determinista y solo devuelve candidatos con DOI válido', async () => {
  const proveedor = new ProveedorFalso('openalex');
  const primera = await proveedor.buscar('floss adoption usability', 2020, 2025, 20);
  const segunda = await new ProveedorFalso('openalex').buscar(
    'floss adoption usability',
    2020,
    2025,
    20,
  );

  assertEquals(primera, segunda);
  assert(primera.length > 0 && primera.length <= 20);
  for (const c of primera) {
    assert(c.doi !== null && esDoiValido(c.doi), `DOI inválido: ${c.doi}`);
    assert(c.anio !== null && c.anio >= 2020 && c.anio <= 2025);
    assertEquals(c.base, 'openalex');
  }
  assertEquals(new Set(primera.map((c) => c.doi)).size, primera.length);
});

Deno.test(
  'ProveedorFalso: consultas distintas dan resultados distintos y cada fuente tiene sus DOI',
  async () => {
    const a = await new ProveedorFalso('openalex').buscar('consulta a', 2020, 2025, 20);
    const b = await new ProveedorFalso('openalex').buscar('consulta b', 2020, 2025, 20);
    const c = await new ProveedorFalso('crossref').buscar('consulta a', 2020, 2025, 20);
    assertNotEquals(
      a.map((x) => x.doi),
      b.map((x) => x.doi),
    );
    assertNotEquals(
      a.map((x) => x.doi),
      c.map((x) => x.doi),
    );
  },
);

Deno.test('ProveedorFalso: respeta el límite y puede devolver respuestas grabadas', async () => {
  assert((await new ProveedorFalso('crossref').buscar('x', 2020, 2025, 3)).length <= 3);
  const grabado = {
    titulo: 'Grabado',
    anio: 2021,
    doi: '10.1000/grabado',
    resumen: null,
    base: 'crossref' as const,
  };
  assertEquals(await new ProveedorFalso('crossref', [grabado]).buscar('x', 2020, 2025, 10), [
    grabado,
  ]);
});

Deno.test(
  'ClasificadorFalso: es determinista, devuelve un veredicto por candidato y mezcla aceptados y rechazados',
  async () => {
    const candidatos = await new ProveedorFalso('openalex').buscar('x', 2020, 2025, 10);
    const clasificador = new ClasificadorFalso();

    const primera = await clasificador.clasificar('f', 's', 'c', candidatos);
    const segunda = await new ClasificadorFalso().clasificar('f', 's', 'c', candidatos);

    assertEquals(primera, segunda);
    assertEquals(
      primera.map((v) => v.indice),
      candidatos.map((_, i) => i + 1),
    );
    for (const v of primera) assert(v.confianza >= 0 && v.confianza <= 1);
    const aceptados = aceptarVeredictos(candidatos, primera, 0.7).length;
    assert(aceptados > 0 && aceptados < candidatos.length, `aceptados: ${aceptados}`);
  },
);
