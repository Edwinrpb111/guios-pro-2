import { assert, assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';
import { OpenAlexProveedor, reconstruirResumen } from './openalex.ts';
import { ErrorProveedorNoDisponible, ErrorRespuestaInvalida } from './errores.ts';
import { crearFetchGuionado, respuestaJson } from './pruebas.ts';

const CLAVE = 'clave-secreta-de-prueba';

Deno.test('reconstruirResumen: ordena las palabras por posición', () => {
  assertEquals(
    reconstruirResumen({ software: [1], Open: [0], libre: [2, 4], es: [3] }),
    'Open software libre es libre',
  );
  assertEquals(reconstruirResumen(null), null);
  assertEquals(reconstruirResumen({}), null);
});

Deno.test('OpenAlex: arma la consulta de BRIEF §13.3 y convierte los resultados', async () => {
  const { fetch, llamadas } = crearFetchGuionado([
    respuestaJson({
      results: [
        {
          id: 'https://openalex.org/W1',
          doi: 'https://doi.org/10.1000/ABC',
          title: 'Adopción de LibreOffice',
          publication_year: 2023,
          abstract_inverted_index: { Estudio: [0], de: [1], caso: [2] },
        },
        { id: 'https://openalex.org/W2', doi: null, title: 'Sin DOI', publication_year: 2022 },
        {
          id: 'https://openalex.org/W3',
          doi: '10.1000/sin-titulo',
          title: '  ',
          publication_year: 2022,
        },
      ],
    }),
  ]);
  const proveedor = new OpenAlexProveedor({ apiKey: CLAVE, fetch });

  const candidatos = await proveedor.buscar('floss adoption', 2020, 2025, 40);

  const url = new URL(llamadas[0]!.url);
  assertEquals(url.origin + url.pathname, 'https://api.openalex.org/works');
  assertEquals(url.searchParams.get('search'), 'floss adoption');
  assertEquals(
    url.searchParams.get('filter'),
    'publication_year:2020-2025,type:article,has_doi:true',
  );
  assertEquals(url.searchParams.get('per_page'), '40');
  assertEquals(
    url.searchParams.get('select'),
    'id,doi,title,publication_year,abstract_inverted_index',
  );
  assertEquals(url.searchParams.get('api_key'), CLAVE);

  assertEquals(candidatos.length, 2);
  assertEquals(candidatos[0], {
    titulo: 'Adopción de LibreOffice',
    anio: 2023,
    doi: '10.1000/abc',
    resumen: 'Estudio de caso',
    base: 'openalex',
  });
  assertEquals(candidatos[1]?.doi, null);
});

Deno.test('OpenAlex: per_page nunca pasa de 100', async () => {
  const { fetch, llamadas } = crearFetchGuionado([respuestaJson({ results: [] })]);
  await new OpenAlexProveedor({ apiKey: CLAVE, fetch }).buscar('x', 2020, 2025, 500);
  assertEquals(new URL(llamadas[0]!.url).searchParams.get('per_page'), '100');
});

Deno.test('OpenAlex: 429, 5xx y caída de red pausan (ErrorProveedorNoDisponible)', async () => {
  for (const guion of [
    respuestaJson({}, 429),
    respuestaJson({}, 503),
    new TypeError(`error sending request for url (https://api.openalex.org/?api_key=${CLAVE})`),
  ]) {
    const { fetch } = crearFetchGuionado([guion]);
    const error = await assertRejects(
      () => new OpenAlexProveedor({ apiKey: CLAVE, fetch }).buscar('x', 2020, 2025, 10),
      ErrorProveedorNoDisponible,
    );
    assert(!error.message.includes(CLAVE), 'el mensaje no debe filtrar la clave');
    assertStringIncludes(error.message, 'OpenAlex');
  }
});

Deno.test(
  'OpenAlex: 401 pide revisar la clave; otro 4xx o un JSON roto es respuesta inválida',
  async () => {
    const sinPermiso = crearFetchGuionado([respuestaJson({}, 401)]);
    const error = await assertRejects(
      () =>
        new OpenAlexProveedor({ apiKey: CLAVE, fetch: sinPermiso.fetch }).buscar(
          'x',
          2020,
          2025,
          10,
        ),
      ErrorProveedorNoDisponible,
    );
    assertStringIncludes(error.message, 'OPENALEX_API_KEY');

    for (const guion of [respuestaJson({}, 400), new Response('no es json', { status: 200 })]) {
      const { fetch } = crearFetchGuionado([guion]);
      await assertRejects(
        () => new OpenAlexProveedor({ apiKey: CLAVE, fetch }).buscar('x', 2020, 2025, 10),
        ErrorRespuestaInvalida,
      );
    }
  },
);
