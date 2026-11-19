import { leerRegistro } from './registro';

const COMPLETO = {
  intento: 1,
  proveedor: 'gemini',
  busqueda: [
    { fuente: 'openalex', ms: 1234, candidatos: 25, error: null },
    { fuente: 'crossref', ms: 800, candidatos: 0, error: 'Crossref respondió 503.' },
  ],
  lotes: [
    { n: 1, tamano: 10, ms: 2345, reintentos: 0, resultado: 'ok', aceptados: 3 },
    { n: 2, tamano: 10, ms: 9000, reintentos: 2, resultado: 'reintento_agotado', aceptados: 0 },
  ],
  aceptados: 3,
  resultado: 'pausado',
  mensaje: 'Gemini no respondió.',
};

describe('leerRegistro', () => {
  it('lee un registro completo con el contrato del backend', () => {
    expect(leerRegistro(COMPLETO)).toEqual(COMPLETO);
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
      aceptados: null,
      resultado: null,
      mensaje: null,
    });
    expect(leerRegistro({ busqueda: [{}], lotes: [{ n: null }] })).toMatchObject({
      busqueda: [{ fuente: null, ms: null, candidatos: null, error: null }],
      lotes: [
        { n: null, tamano: null, ms: null, reintentos: null, resultado: null, aceptados: null },
      ],
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
      lotes: [
        { n: null, tamano: null, ms: null, reintentos: null, resultado: null, aceptados: null },
      ],
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
});
