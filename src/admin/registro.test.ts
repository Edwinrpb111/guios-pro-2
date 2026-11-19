import { leerRegistro } from './registro';

const COMPLETO = {
  intento: 1,
  proveedor: 'gemini',
  busqueda: [
    { fuente: 'openalex', ms: 1234, candidatos: 25, error: null },
    { fuente: 'crossref', ms: 800, candidatos: 0, error: 'Crossref respondió 503.' },
  ],
  lotes: [
    {
      n: 1,
      tamano: 10,
      ms: 2345,
      reintentos: 0,
      resultado: 'ok',
      aceptados: 3,
      tokensEntrada: 900,
      tokensSalida: 280,
      tokensRazonamiento: 1900,
    },
    {
      n: 2,
      tamano: 10,
      ms: 9000,
      reintentos: 2,
      resultado: 'reintento_agotado',
      aceptados: 0,
      tokensEntrada: null,
      tokensSalida: null,
      tokensRazonamiento: null,
    },
  ],
  etapa: 'clasificando',
  lotesTotal: 5,
  aceptados: 3,
  resultado: 'pausado',
  mensaje: 'Gemini no respondió.',
};

/** Lo que escribe la Edge Function (claves en snake_case, contrato de #45). */
const ENTRADA = {
  ...COMPLETO,
  lotes: [
    {
      n: 1,
      tamano: 10,
      ms: 2345,
      reintentos: 0,
      resultado: 'ok',
      aceptados: 3,
      tokens_entrada: 900,
      tokens_salida: 280,
      tokens_razonamiento: 1900,
    },
    { n: 2, tamano: 10, ms: 9000, reintentos: 2, resultado: 'reintento_agotado', aceptados: 0 },
  ],
  lotes_total: 5,
};

const LOTE_VACIO = {
  n: null,
  tamano: null,
  ms: null,
  reintentos: null,
  resultado: null,
  aceptados: null,
  tokensEntrada: null,
  tokensSalida: null,
  tokensRazonamiento: null,
};

describe('leerRegistro', () => {
  it('lee un registro completo con el contrato del backend', () => {
    expect(leerRegistro(ENTRADA)).toEqual(COMPLETO);
  });

  it.each([null, undefined, 'texto', 42, true, [], [1, 2]])(
    'un valor que no es un objeto (%j) no da registro',
    (valor) => {
      expect(leerRegistro(valor)).toBeNull();
    },
  );

  it('tolera campos ausentes o nulos', () => {
    expect(leerRegistro({})).toEqual({
      intento: null,
      proveedor: null,
      busqueda: [],
      lotes: [],
      etapa: null,
      lotesTotal: null,
      aceptados: null,
      resultado: null,
      mensaje: null,
    });
    expect(leerRegistro({ busqueda: [{}], lotes: [{ n: null }] })).toMatchObject({
      busqueda: [{ fuente: null, ms: null, candidatos: null, error: null }],
      lotes: [LOTE_VACIO],
    });
  });

  it('descarta valores de tipo equivocado, negativos o no finitos', () => {
    const registro = leerRegistro({
      intento: '1',
      proveedor: 7,
      busqueda: 'no es lista',
      lotes: [null, 'x', 3, { ms: -5, n: Number.NaN, resultado: {}, aceptados: Infinity }],
      aceptados: -1,
      resultado: ['hecho'],
      mensaje: '   ',
    });
    expect(registro).toEqual({
      intento: null,
      proveedor: null,
      busqueda: [],
      lotes: [LOTE_VACIO],
      etapa: null,
      lotesTotal: null,
      aceptados: null,
      resultado: null,
      mensaje: null,
    });
  });

  it('acota listas y textos desmesurados', () => {
    const registro = leerRegistro({
      lotes: Array.from({ length: 200 }, (_, i) => ({ n: i + 1 })),
      mensaje: 'x'.repeat(5000),
    });
    expect(registro?.lotes).toHaveLength(50);
    expect(registro?.mensaje).toHaveLength(500);
  });

  it.each(['buscando', 'clasificando', 'guardando'] as const)('acepta la etapa «%s»', (etapa) => {
    expect(leerRegistro({ etapa })?.etapa).toBe(etapa);
  });

  it.each([null, 'terminado', 'BUSCANDO', 3, true, {}, ['buscando']])(
    'una etapa no válida (%j) queda en null',
    (etapa) => {
      expect(leerRegistro({ etapa })?.etapa).toBeNull();
    },
  );

  it.each([0, 1, 5, 61])('acepta lotes_total entero (%j)', (lotes) => {
    expect(leerRegistro({ lotes_total: lotes })?.lotesTotal).toBe(lotes);
  });

  it.each([-1, 2.5, Number.NaN, Infinity, '5', null, {}, true])(
    'lotes_total no entero o no válido (%j) queda en null',
    (lotes) => {
      expect(leerRegistro({ lotes_total: lotes })?.lotesTotal).toBeNull();
    },
  );

  it('lee los tokens de cada tanda y descarta los que no son enteros no negativos', () => {
    const registro = leerRegistro({
      lotes: [
        { tokens_entrada: 10, tokens_salida: 0, tokens_razonamiento: 1900 },
        { tokens_entrada: -1, tokens_salida: 1.5, tokens_razonamiento: '7' },
        { tokens_entrada: null },
      ],
    });
    expect(
      registro?.lotes.map((l) => [l.tokensEntrada, l.tokensSalida, l.tokensRazonamiento]),
    ).toEqual([
      [10, 0, 1900],
      [null, null, null],
      [null, null, null],
    ]);
  });
});
