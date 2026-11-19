import { assert, assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  aceptarVeredictos,
  EVIDENCIA_MAXIMA,
  GeminiClasificador,
  limpiarEvidencia,
  repartirVeredictos,
  VERSION_PROMPT,
} from './clasificador.ts';
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

// Trazabilidad (issue #46, S17): aceptados y rechazados conservan confianza y evidencia -------

Deno.test(
  'repartirVeredictos: los aceptados conservan confianza y evidencia de la IA (S17a)',
  () => {
    const lote = [candidato(1), candidato(2)];
    const { aceptados, rechazados } = repartirVeredictos(
      lote,
      [
        veredicto(1, { confianza: 0.85, evidencia: 'Usa formatos abiertos.' }),
        veredicto(2, { confianza: 0.7, evidencia: 'Menciona ODF.' }),
      ],
      0.7,
    );
    assertEquals(
      aceptados.map((a) => [a.candidato.doi, a.confianza, a.evidencia]),
      [
        ['10.1000/art.1', 0.85, 'Usa formatos abiertos.'],
        ['10.1000/art.2', 0.7, 'Menciona ODF.'],
      ],
    );
    assertEquals(rechazados, []);
  },
);

Deno.test(
  'repartirVeredictos: rechaza lo que no trata el subfactor o queda bajo el umbral (S17b)',
  () => {
    const lote = [candidato(1), candidato(2), candidato(3), candidato(4)];
    const { aceptados, rechazados } = repartirVeredictos(
      lote,
      [
        veredicto(1, { confianza: 0.9 }),
        veredicto(2, { confianza: 0.69, evidencia: 'Tangencial.' }), // bajo el umbral
        veredicto(3, { trata_subfactor: false, confianza: 0.95, evidencia: 'Otro tema.' }),
        veredicto(4, { confianza: 0.7 }), // justo en el umbral: se acepta
      ],
      0.7,
    );
    assertEquals(
      aceptados.map((a) => a.candidato.doi),
      ['10.1000/art.1', '10.1000/art.4'],
    );
    assertEquals(
      rechazados.map((r) => [r.candidato.doi, r.confianza, r.evidencia]),
      [
        ['10.1000/art.2', 0.69, 'Tangencial.'],
        ['10.1000/art.3', 0.95, 'Otro tema.'],
      ],
    );
  },
);

Deno.test(
  'repartirVeredictos: un índice inválido no es rechazado y un candidato no se repite',
  () => {
    const lote = [candidato(1), candidato(2), candidato(3)];
    const { aceptados, rechazados } = repartirVeredictos(
      lote,
      [
        veredicto(0),
        veredicto(9, { trata_subfactor: false }),
        veredicto(-1, { trata_subfactor: false }),
        veredicto(1.5, { trata_subfactor: false }),
        veredicto(1, { confianza: 0.9 }),
        veredicto(1, { trata_subfactor: false, confianza: 0.1 }), // el primero manda
        veredicto(2, { trata_subfactor: false, confianza: 0.2 }),
        veredicto(2, { confianza: 0.99 }), // ya visto: no pasa a aceptado
      ],
      0.7,
    );
    assertEquals(
      aceptados.map((a) => a.candidato.doi),
      ['10.1000/art.1'],
    );
    assertEquals(
      rechazados.map((r) => r.candidato.doi),
      ['10.1000/art.2'],
    );
    // El candidato 3 no recibió veredicto: no se clasificó, no es rechazado.
  },
);

Deno.test('repartirVeredictos: la confianza se acota a 0..1 y la no numérica queda en null', () => {
  const lote = [candidato(1), candidato(2), candidato(3), candidato(4)];
  const { aceptados, rechazados } = repartirVeredictos(
    lote,
    [
      veredicto(1, { confianza: 1.7 }), // la columna es 0..1: se acota
      veredicto(2, { confianza: -0.4, trata_subfactor: false }),
      veredicto(3, { confianza: Number.NaN }),
      veredicto(4, { confianza: Number.POSITIVE_INFINITY }),
    ],
    0.7,
  );
  assertEquals(
    aceptados.map((a) => [a.candidato.doi, a.confianza]),
    [['10.1000/art.1', 1]],
  );
  assertEquals(
    rechazados.map((r) => [r.candidato.doi, r.confianza]),
    [
      ['10.1000/art.2', 0],
      ['10.1000/art.3', null],
      ['10.1000/art.4', null],
    ],
  );
});

Deno.test('limpiarEvidencia: recorta espacios y limita a 500 caracteres (S17a)', () => {
  assertEquals(EVIDENCIA_MAXIMA, 500);
  assertEquals(limpiarEvidencia('  Trata el tema.  '), 'Trata el tema.');
  assertEquals(limpiarEvidencia('x'.repeat(900))?.length, 500);
  // Primero se recortan los espacios y después el largo.
  assertEquals(limpiarEvidencia(`   ${'y'.repeat(500)}   `), 'y'.repeat(500));
});

Deno.test('limpiarEvidencia: vacía o sin texto queda en null', () => {
  assertEquals(limpiarEvidencia(''), null);
  assertEquals(limpiarEvidencia('   \n\t '), null);
  assertEquals(limpiarEvidencia(undefined), null);
  assertEquals(limpiarEvidencia(42 as unknown as string), null);
});

Deno.test(
  'limpiarEvidencia: texto no confiable, sin caracteres de control que rompan la BD',
  () => {
    // Postgres no admite U+0000 en texto: llegaría como error y tumbaría el paso.
    assertEquals(limpiarEvidencia('a\u0000b\u0007c'), 'a b c');
    // Se conserva como texto plano: no se interpreta ni se elimina el marcado.
    assertEquals(limpiarEvidencia('<script>alert(1)</script>'), '<script>alert(1)</script>');
    // No deja medio par sustituto al cortar en 500.
    const emoji = `${'a'.repeat(499)}😀`;
    const cortada = limpiarEvidencia(emoji)!;
    assertEquals(cortada, 'a'.repeat(499));
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

Deno.test('limpiarEvidencia: quita los sustitutos sueltos y conserva los pares válidos', () => {
  assertEquals(limpiarEvidencia('a\ud83db'), 'ab');
  assertEquals(limpiarEvidencia('a\ude00b'), 'ab');
  assertEquals(limpiarEvidencia('a😀b'), 'a😀b');
});
