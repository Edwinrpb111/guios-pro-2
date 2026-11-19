import { assert, assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';
import { armarConsulta, buscarYClasificar } from './busqueda.ts';
import { ErrorProveedorNoDisponible } from './errores.ts';
import type { ProveedorBusqueda } from './tipos.ts';
import {
  candidato,
  CATALOGO_PRUEBA,
  clasificadorGuionado,
  CONTEXTO_PRUEBA,
  proveedorFijo,
} from './pruebas.ts';

const SUBFACTOR = CATALOGO_PRUEBA[0]!;
const BASE = { anioInicio: 2020, anioFin: 2025, umbral: 0.7, maxCandidatos: 50 };

function ejecutar(
  proveedores: ProveedorBusqueda[],
  clasificador = clasificadorGuionado(),
  cambios: Partial<typeof BASE> = {},
) {
  return buscarYClasificar({
    ...BASE,
    ...cambios,
    subfactor: SUBFACTOR,
    contexto: CONTEXTO_PRUEBA,
    proveedores,
    clasificador,
  });
}

Deno.test('armarConsulta: mezcla la frase base, el factor y los términos del subfactor', () => {
  const consulta = armarConsulta(['compatibility', 'interoperability'], ['open formats']);
  assertStringIncludes(consulta, 'open source software adoption');
  assertStringIncludes(consulta, 'FLOSS');
  assertStringIncludes(consulta, 'compatibility');
  assertStringIncludes(consulta, 'open formats');
});

Deno.test('armarConsulta: limita la cantidad de términos y el largo', () => {
  const muchos = Array.from({ length: 30 }, (_, i) => `término largo número ${i}`);
  const consulta = armarConsulta(muchos, muchos);
  assert(consulta.length <= 300, `largo ${consulta.length}`);
  assert(!consulta.includes('número 29'));
});

Deno.test(
  'solo se guardan artículos con DOI (descarta sin DOI, sin año o fuera del rango)',
  async () => {
    const proveedor = proveedorFijo('openalex', [
      candidato(1),
      candidato(2, { doi: null }),
      candidato(3, { anio: null }),
      candidato(4, { anio: 2019 }),
      candidato(5, { anio: 2026 }),
      candidato(6, { doi: 'no-es-un-doi' }),
    ]);
    const clasificador = clasificadorGuionado();

    const resultado = await ejecutar([proveedor], clasificador);

    assertEquals(resultado.candidatos, 1);
    assertEquals(
      resultado.referencias.map((r) => r.doi),
      ['10.1000/art.1'],
    );
    assertEquals(clasificador.lotes.flat().length, 1, 'solo se clasifica lo que tiene DOI');
  },
);

Deno.test('deduplica por DOI entre fuentes y entre formas de escribirlo', async () => {
  const a = proveedorFijo('openalex', [candidato(1, { doi: '10.1000/art.1', resumen: null })]);
  const c = proveedorFijo('crossref', [
    candidato(1, { doi: 'https://doi.org/10.1000/ART.1', resumen: 'Resumen de Crossref' }),
    candidato(2),
  ]);
  const clasificador = clasificadorGuionado();

  const resultado = await ejecutar([a, c], clasificador);

  assertEquals(resultado.candidatos, 2);
  assertEquals(resultado.referencias.map((r) => r.doi).sort(), ['10.1000/art.1', '10.1000/art.2']);
  const repetido = clasificador.lotes.flat().find((x) => x.doi === '10.1000/art.1');
  assertEquals(repetido?.resumen, 'Resumen de Crossref', 'conserva el resumen que sí vino');
});

Deno.test(
  'recorta a RECALCULO_MAX_CANDIDATOS repartiendo entre fuentes y clasifica en lotes de 10',
  async () => {
    const a = proveedorFijo(
      'openalex',
      Array.from({ length: 30 }, (_, i) => candidato(i + 1)),
    );
    const c = proveedorFijo(
      'crossref',
      Array.from({ length: 30 }, (_, i) => candidato(i + 101)),
    );
    const clasificador = clasificadorGuionado();

    const resultado = await ejecutar([a, c], clasificador, { maxCandidatos: 25 });

    assertEquals(resultado.candidatos, 25);
    assertEquals(
      clasificador.lotes.map((lote) => lote.length),
      [10, 10, 5],
    );
    const bases = clasificador.lotes.flat().map((x) => x.base);
    assertEquals(bases.filter((b) => b === 'openalex').length, 13);
    assertEquals(bases.filter((b) => b === 'crossref').length, 12);
  },
);

Deno.test(
  'guarda solo los aceptados y descarta un índice inexistente del clasificador',
  async () => {
    const proveedor = proveedorFijo('openalex', [candidato(1), candidato(2), candidato(3)]);
    const clasificador = clasificadorGuionado(() => [
      { indice: 1, trata_subfactor: true, confianza: 0.9, evidencia: 'ok' },
      { indice: 2, trata_subfactor: true, confianza: 0.4, evidencia: 'dudoso' },
      { indice: 9, trata_subfactor: true, confianza: 1, evidencia: 'inventado' },
    ]);

    const resultado = await ejecutar([proveedor], clasificador);

    assertEquals(resultado.candidatos, 3);
    assertEquals(resultado.referencias, [
      {
        titulo: 'Artículo 1',
        anio: 2022,
        doi: '10.1000/art.1',
        base_datos: 'openalex',
        confianza: 0.9,
        evidencia: 'ok',
      },
    ]);
    // El 2 lo clasificó la IA y no llegó al umbral: es rechazado. El 3 no recibió veredicto y el
    // índice 9 no existe: ninguno de los dos se guarda como rechazado.
    assertEquals(resultado.rechazadas, [
      {
        titulo: 'Artículo 2',
        anio: 2022,
        doi: '10.1000/art.2',
        base_datos: 'openalex',
        confianza: 0.4,
        evidencia: 'dudoso',
      },
    ]);
  },
);

Deno.test(
  'trazabilidad: rechaza lo que la IA clasificó (no trata o bajo el umbral) con su confianza y evidencia',
  async () => {
    const proveedor = proveedorFijo('crossref', [candidato(1), candidato(2), candidato(3)]);
    const clasificador = clasificadorGuionado(() => [
      { indice: 1, trata_subfactor: false, confianza: 0.95, evidencia: '  No es del tema.  ' },
      { indice: 2, trata_subfactor: true, confianza: 0.55, evidencia: 'x'.repeat(900) },
      { indice: 3, trata_subfactor: true, confianza: 0.8, evidencia: 'Sí lo trata.' },
    ]);

    const resultado = await ejecutar([proveedor], clasificador);

    assertEquals(
      resultado.rechazadas.map((r) => [r.doi, r.base_datos, r.confianza, r.evidencia?.length]),
      [
        ['10.1000/art.1', 'crossref', 0.95, 'No es del tema.'.length],
        ['10.1000/art.2', 'crossref', 0.55, 500],
      ],
    );
    assertEquals(resultado.rechazadas[0]?.evidencia, 'No es del tema.');
    assertEquals(
      resultado.referencias.map((r) => [r.doi, r.confianza, r.evidencia]),
      [['10.1000/art.3', 0.8, 'Sí lo trata.']],
    );
  },
);

Deno.test('trazabilidad: la evidencia de una referencia aceptada se recorta a 500', async () => {
  const proveedor = proveedorFijo('openalex', [candidato(1), candidato(2)]);
  const clasificador = clasificadorGuionado(() => [
    { indice: 1, trata_subfactor: true, confianza: 0.9, evidencia: `  ${'e'.repeat(700)}  ` },
    { indice: 2, trata_subfactor: true, confianza: 0.9, evidencia: '   ' },
  ]);

  const { referencias } = await ejecutar([proveedor], clasificador);

  assertEquals(referencias[0]?.evidencia, 'e'.repeat(500));
  assertEquals(referencias[1]?.evidencia, null, 'una evidencia vacía queda en null');
});

Deno.test(
  'trazabilidad: lo descartado antes de clasificar y los índices inválidos no son rechazados',
  async () => {
    const proveedor = proveedorFijo('openalex', [
      candidato(1),
      candidato(2, { doi: null }),
      candidato(3, { anio: 2019 }),
      candidato(4, { doi: 'no-es-un-doi' }),
    ]);
    const clasificador = clasificadorGuionado(() => [
      { indice: 1, trata_subfactor: true, confianza: 0.9, evidencia: 'ok' },
      { indice: 0, trata_subfactor: false, confianza: 0.1, evidencia: 'inválido' },
      { indice: 7, trata_subfactor: false, confianza: 0.1, evidencia: 'inválido' },
    ]);

    const resultado = await ejecutar([proveedor], clasificador);

    assertEquals(resultado.rechazadas, []);
    assertEquals(resultado.referencias.length, 1);
  },
);

Deno.test(
  'trazabilidad: el título de un rechazado también se recorta a la columna (500)',
  async () => {
    const proveedor = proveedorFijo('openalex', [candidato(1, { titulo: 'T'.repeat(600) })]);
    const clasificador = clasificadorGuionado(() => [
      { indice: 1, trata_subfactor: false, confianza: 0.2, evidencia: 'no' },
    ]);

    const { rechazadas } = await ejecutar([proveedor], clasificador);

    assertEquals(rechazadas[0]?.titulo.length, 500);
  },
);

Deno.test('respeta el umbral de confianza recibido', async () => {
  const proveedor = proveedorFijo('openalex', [candidato(1)]);
  const clasificador = () =>
    clasificadorGuionado(() => [
      { indice: 1, trata_subfactor: true, confianza: 0.8, evidencia: 'ok' },
    ]);
  assertEquals(
    (await ejecutar([proveedor], clasificador(), { umbral: 0.8 })).referencias.length,
    1,
  );
  assertEquals(
    (await ejecutar([proveedor], clasificador(), { umbral: 0.81 })).referencias.length,
    0,
  );
});

Deno.test('envía a los proveedores la consulta, los años y el límite', async () => {
  const proveedor = proveedorFijo('openalex', []);
  await ejecutar([proveedor], clasificadorGuionado(), { maxCandidatos: 15 });
  assertEquals(proveedor.consultas.length, 1);
  assertStringIncludes(proveedor.consultas[0]!, 'open formats');
  assertEquals(proveedor.llamadas[0]!.slice(1), [2020, 2025, 15]);
});

Deno.test('recorta el título a la columna (500) y no clasifica si no hay candidatos', async () => {
  const largo = proveedorFijo('openalex', [candidato(1, { titulo: 'T'.repeat(600) })]);
  const resultado = await ejecutar([largo]);
  assertEquals(resultado.referencias[0]?.titulo.length, 500);

  const clasificador = clasificadorGuionado();
  const vacio = await ejecutar([proveedorFijo('openalex', [])], clasificador);
  assertEquals(vacio, { candidatos: 0, referencias: [], rechazadas: [] });
  assertEquals(clasificador.lotes.length, 0);
});

Deno.test('un error de un proveedor sube tal cual para pausar el cálculo', async () => {
  const roto = {
    nombre: 'crossref' as const,
    buscar: () => Promise.reject(new ErrorProveedorNoDisponible('Crossref caído')),
  };
  await assertRejects(
    () => ejecutar([proveedorFijo('openalex', [candidato(1)]), roto]),
    ErrorProveedorNoDisponible,
    'Crossref caído',
  );
});
