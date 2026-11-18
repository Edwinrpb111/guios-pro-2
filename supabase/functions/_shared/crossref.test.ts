import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';
import { CrossrefProveedor } from './crossref.ts';
import { ErrorProveedorNoDisponible, ErrorRespuestaInvalida } from './errores.ts';
import { crearFetchGuionado, respuestaJson } from './pruebas.ts';

const OPCIONES_RAPIDAS = { ahora: () => 0, esperar: () => Promise.resolve() };

Deno.test('Crossref: arma la consulta de BRIEF §13.3 y convierte los resultados', async () => {
  const { fetch, llamadas } = crearFetchGuionado([
    respuestaJson({
      message: {
        items: [
          {
            DOI: '10.1000/XYZ',
            title: ['Migración a software libre'],
            issued: { 'date-parts': [[2021, 5]] },
            abstract: '<jats:p>Un <jats:italic>estudio</jats:italic> &amp; análisis.</jats:p>',
          },
          {
            DOI: '10.1000/sin-resumen',
            title: ['Solo título'],
            issued: { 'date-parts': [[2024]] },
          },
          { DOI: '10.1000/sin-anio', title: ['Sin año'], issued: { 'date-parts': [[null]] } },
          { title: ['Sin DOI'], issued: { 'date-parts': [[2022]] } },
        ],
      },
    }),
  ]);
  const proveedor = new CrossrefProveedor({
    mailto: 'equipo@ejemplo.org',
    fetch,
    ...OPCIONES_RAPIDAS,
  });

  const candidatos = await proveedor.buscar('floss adoption', 2020, 2025, 80);

  const url = new URL(llamadas[0]!.url);
  assertEquals(url.origin + url.pathname, 'https://api.crossref.org/works');
  assertEquals(url.searchParams.get('query.bibliographic'), 'floss adoption');
  assertEquals(
    url.searchParams.get('filter'),
    'from-pub-date:2020-01-01,until-pub-date:2025-12-31,type:journal-article',
  );
  assertEquals(url.searchParams.get('rows'), '50');
  assertEquals(url.searchParams.get('select'), 'DOI,title,issued,abstract');
  assertEquals(url.searchParams.get('mailto'), 'equipo@ejemplo.org');

  assertEquals(candidatos.length, 4);
  assertEquals(candidatos[0], {
    titulo: 'Migración a software libre',
    anio: 2021,
    doi: '10.1000/xyz',
    resumen: 'Un estudio & análisis.',
    base: 'crossref',
  });
  assertEquals(candidatos[1]?.resumen, null);
  assertEquals(candidatos[2]?.anio, null);
  assertEquals(candidatos[3]?.doi, null);
});

Deno.test('Crossref: sin correo no manda el parámetro mailto', async () => {
  const { fetch, llamadas } = crearFetchGuionado([respuestaJson({ message: { items: [] } })]);
  await new CrossrefProveedor({ fetch, ...OPCIONES_RAPIDAS }).buscar('x', 2020, 2025, 10);
  assertEquals(new URL(llamadas[0]!.url).searchParams.has('mailto'), false);
});

Deno.test('Crossref: espera entre consultas para no pasar de 1 por segundo', async () => {
  const esperas: number[] = [];
  const { fetch } = crearFetchGuionado([respuestaJson({ message: { items: [] } })]);
  const proveedor = new CrossrefProveedor({
    fetch,
    ahora: () => 5_000,
    esperar: (ms) => {
      esperas.push(ms);
      return Promise.resolve();
    },
  });
  await proveedor.buscar('a', 2020, 2025, 10);
  assertEquals(esperas, []);
  await proveedor.buscar('b', 2020, 2025, 10);
  assertEquals(esperas, [1000]);
});

Deno.test('Crossref: respeta x-rate-limit-* si exige más espera que 1 segundo', async () => {
  const esperas: number[] = [];
  const { fetch } = crearFetchGuionado([
    respuestaJson({ message: { items: [] } }, 200, {
      'x-rate-limit-limit': '1',
      'x-rate-limit-interval': '3s',
    }),
  ]);
  const proveedor = new CrossrefProveedor({
    fetch,
    ahora: () => 0,
    esperar: (ms) => {
      esperas.push(ms);
      return Promise.resolve();
    },
  });
  await proveedor.buscar('a', 2020, 2025, 10);
  await proveedor.buscar('b', 2020, 2025, 10);
  assertEquals(esperas, [3000]);
});

Deno.test('Crossref: 429, 5xx y caída de red pausan (ErrorProveedorNoDisponible)', async () => {
  for (const guion of [
    respuestaJson({}, 429),
    respuestaJson({}, 502),
    new TypeError('error sending request'),
  ]) {
    const { fetch } = crearFetchGuionado([guion]);
    const error = await assertRejects(
      () => new CrossrefProveedor({ fetch, ...OPCIONES_RAPIDAS }).buscar('x', 2020, 2025, 10),
      ErrorProveedorNoDisponible,
    );
    assertStringIncludes(error.message, 'Crossref');
  }
});

Deno.test('Crossref: un 4xx o un JSON roto es respuesta inválida', async () => {
  for (const guion of [respuestaJson({}, 400), new Response('no es json', { status: 200 })]) {
    const { fetch } = crearFetchGuionado([guion]);
    await assertRejects(
      () => new CrossrefProveedor({ fetch, ...OPCIONES_RAPIDAS }).buscar('x', 2020, 2025, 10),
      ErrorRespuestaInvalida,
    );
  }
});
