import { assert, assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';
import { aceptarVeredictos, GeminiClasificador, VERSION_PROMPT } from './clasificador.ts';
import { ErrorProveedorNoDisponible, ErrorRespuestaInvalida } from './errores.ts';
import { candidato, crearFetchGuionado, respuestaJson } from './pruebas.ts';
import type { Veredicto } from './tipos.ts';

const CLAVE = 'clave-gemini-de-prueba';

function veredicto(indice: number, cambios: Partial<Veredicto> = {}): Veredicto {
  return { indice, trata_subfactor: true, confianza: 0.9, evidencia: 'ok', ...cambios };
}

function respuestaGemini(contenido: unknown) {
  return respuestaJson({
    candidates: [{ content: { parts: [{ text: JSON.stringify(contenido) }] } }],
  });
}

Deno.test(
  'aceptarVeredictos: acepta solo si trata el subfactor y la confianza llega al umbral',
  () => {
    const lote = [candidato(1), candidato(2), candidato(3), candidato(4)];
    const aceptados = aceptarVeredictos(
      lote,
      [
        veredicto(1, { confianza: 0.7 }), // justo en el umbral: se acepta
        veredicto(2, { confianza: 0.69 }),
        veredicto(3, { trata_subfactor: false, confianza: 1 }),
        veredicto(4, { confianza: 0.95 }),
      ],
      0.7,
    );
    assertEquals(
      aceptados.map((c) => c.doi),
      ['10.1000/art.1', '10.1000/art.4'],
    );
  },
);

Deno.test('aceptarVeredictos: descarta un índice que no existe en la lista (BRIEF §13.3)', () => {
  const lote = [candidato(1), candidato(2)];
  const aceptados = aceptarVeredictos(
    lote,
    [veredicto(0), veredicto(3), veredicto(99), veredicto(-1), veredicto(1.5), veredicto(2)],
    0.7,
  );
  assertEquals(
    aceptados.map((c) => c.doi),
    ['10.1000/art.2'],
  );
});

Deno.test(
  'aceptarVeredictos: un candidato no se acepta dos veces y la confianza inválida se descarta',
  () => {
    const lote = [candidato(1), candidato(2)];
    const aceptados = aceptarVeredictos(
      lote,
      [
        veredicto(1),
        veredicto(1, { confianza: 0.99 }),
        veredicto(2, { confianza: Number.NaN }),
        veredicto(2, { confianza: Number.POSITIVE_INFINITY }),
      ],
      0.7,
    );
    assertEquals(
      aceptados.map((c) => c.doi),
      ['10.1000/art.1'],
    );
  },
);

Deno.test(
  'Gemini: arma la petición con salida JSON estructurada, temperature 0 y la clave en cabecera',
  async () => {
    const { fetch, llamadas } = crearFetchGuionado([respuestaGemini([veredicto(1)])]);
    const clasificador = new GeminiClasificador({
      apiKey: CLAVE,
      modelo: 'gemini-3.1-flash-lite',
      fetch,
    });

    const veredictos = await clasificador.clasificar(
      'Compatibilidad',
      'El software utiliza formatos estándar',
      'Uso de formatos abiertos.',
      [
        candidato(1, { titulo: 'Formatos abiertos', resumen: 'Estudio de ODF' }),
        candidato(2, { resumen: null }),
      ],
    );

    assertEquals(veredictos, [veredicto(1)]);
    const peticion = llamadas[0]!;
    assertEquals(
      peticion.url,
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
    );
    assertEquals(peticion.headers.get('x-goog-api-key'), CLAVE);
    assert(!peticion.url.includes(CLAVE), 'la clave no va en la dirección');

    const cuerpo = await peticion.json();
    assertEquals(cuerpo.generationConfig.temperature, 0);
    assertEquals(cuerpo.generationConfig.responseMimeType, 'application/json');
    assertEquals(cuerpo.generationConfig.responseSchema.type, 'ARRAY');
    const texto: string = cuerpo.contents[0].parts[0].text;
    for (const esperado of [
      'Compatibilidad',
      'El software utiliza formatos estándar',
      'Uso de formatos abiertos.',
      '1. Formatos abiertos',
      'Estudio de ODF',
      '2. Artículo 2',
    ]) {
      assertStringIncludes(texto, esperado);
    }
    assertStringIncludes(cuerpo.systemInstruction.parts[0].text, 'no confiable');
  },
);

Deno.test('Gemini: ignora los elementos mal formados de la respuesta', async () => {
  const { fetch } = crearFetchGuionado([
    respuestaGemini([
      veredicto(1),
      { indice: '2', trata_subfactor: true, confianza: 0.9 },
      { indice: 3, trata_subfactor: 'sí', confianza: 0.9 },
      { indice: 4, trata_subfactor: true, confianza: '0.9' },
      null,
      7,
      { indice: 5, trata_subfactor: false, confianza: 0.2 },
    ]),
  ]);
  const veredictos = await new GeminiClasificador({ apiKey: CLAVE, modelo: 'm', fetch }).clasificar(
    'f',
    's',
    'c',
    [candidato(1)],
  );
  assertEquals(veredictos, [
    veredicto(1),
    { indice: 5, trata_subfactor: false, confianza: 0.2, evidencia: '' },
  ]);
});

Deno.test(
  'Gemini: 429, 5xx, clave rechazada y caída de red pausan sin filtrar la clave',
  async () => {
    const claveRechazada = respuestaJson(
      {
        error: {
          status: 'INVALID_ARGUMENT',
          message: 'API key not valid. Please pass a valid API key.',
        },
      },
      400,
    );
    for (const guion of [
      respuestaJson({}, 429),
      respuestaJson({}, 503),
      respuestaJson({}, 403),
      respuestaJson({}, 401),
      claveRechazada,
      new TypeError(`error sending request (key=${CLAVE})`),
    ]) {
      const { fetch } = crearFetchGuionado([guion]);
      const error = await assertRejects(
        () =>
          new GeminiClasificador({ apiKey: CLAVE, modelo: 'm', fetch }).clasificar('f', 's', 'c', [
            candidato(1),
          ]),
        ErrorProveedorNoDisponible,
      );
      assert(!error.message.includes(CLAVE), 'el mensaje no debe filtrar la clave');
      assertStringIncludes(error.message, 'Gemini');
    }
  },
);

Deno.test('Gemini: una respuesta que no se puede interpretar es respuesta inválida', async () => {
  const malas = [
    respuestaJson({}, 400),
    new Response('no es json', { status: 200 }),
    respuestaJson({ candidates: [] }),
    respuestaJson({ promptFeedback: { blockReason: 'SAFETY' } }),
    respuestaJson({ candidates: [{ content: { parts: [{ text: 'no es json' }] } }] }),
    respuestaGemini({ no: 'es un arreglo' }),
  ];
  for (const guion of malas) {
    const { fetch } = crearFetchGuionado([guion]);
    await assertRejects(
      () =>
        new GeminiClasificador({ apiKey: CLAVE, modelo: 'm', fetch }).clasificar('f', 's', 'c', [
          candidato(1),
        ]),
      ErrorRespuestaInvalida,
    );
  }
});

Deno.test('Gemini: recorta resúmenes largos y declara la versión del prompt', async () => {
  const { fetch, llamadas } = crearFetchGuionado([respuestaGemini([])]);
  await new GeminiClasificador({ apiKey: CLAVE, modelo: 'm', fetch }).clasificar('f', 's', 'c', [
    candidato(1, { resumen: 'x'.repeat(5000) }),
  ]);
  const cuerpo = await llamadas[0]!.json();
  assert(cuerpo.contents[0].parts[0].text.length < 3000);
  assertEquals(VERSION_PROMPT, 'v1');
});
