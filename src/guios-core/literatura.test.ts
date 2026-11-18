import { IE_EXPERTOS, METODO_CUARTILES, cuartiles, il, razon, recalcularIS } from './literatura';
import tesis from './fixtures/is_tesis.json';

describe('razon (RN-09)', () => {
  it('es citas / número de subfactores', () => {
    expect(razon(33, 8)).toBe(4.125);
  });

  it('rechaza un factor sin subfactores o citas negativas', () => {
    expect(() => razon(3, 0)).toThrow(RangeError);
    expect(() => razon(-1, 2)).toThrow(RangeError);
  });
});

describe('cuartiles (RN-09)', () => {
  const rs = tesis.factores.map((f) => razon(f.tc, f.ns));

  it('por defecto usa interpolación lineal — valores de §6.2', () => {
    expect(METODO_CUARTILES).toBe('lineal');
    const { q1, q2, q3 } = cuartiles(rs);
    expect(q1).toBeCloseTo(tesis.cuartiles.q1, 4);
    expect(q2).toBeCloseTo(tesis.cuartiles.q2, 10);
    expect(q3).toBeCloseTo(tesis.cuartiles.q3, 4);
  });

  it('coincide con numpy.percentile en un caso conocido', () => {
    expect(cuartiles([1, 2, 3, 4])).toEqual({ q1: 1.75, q2: 2.5, q3: 3.25 });
    expect(cuartiles([1, 2, 3, 4], 'inferior')).toEqual({ q1: 1, q2: 2, q3: 3 });
  });

  it('no depende del orden de entrada ni lo altera', () => {
    const entrada = [4, 1, 3, 2];
    expect(cuartiles(entrada)).toEqual(cuartiles([1, 2, 3, 4]));
    expect(entrada).toEqual([4, 1, 3, 2]);
  });

  it('rechaza una lista vacía', () => {
    expect(() => cuartiles([])).toThrow(RangeError);
  });
});

describe('il (RN-09)', () => {
  const q = { q1: 1, q2: 2, q3: 3 };
  it('asigna 1..4 con límites inclusivos', () => {
    expect([0.5, 1, 1.5, 2, 2.5, 3, 3.01].map((r) => il(r, q))).toEqual([1, 1, 2, 2, 3, 3, 4]);
  });
});

describe('recalcularIS (RN-09, RN-10) — fixture §6.2', () => {
  const entradas = tesis.factores.map(({ tc, ns }) => ({ citas: tc, subfactores: ns }));

  it('IE fija en 3', () => {
    expect(IE_EXPERTOS).toBe(tesis.ie);
  });

  it.each(['lineal', 'inferior'] as const)('reproduce IL e IS de la Tabla 5.3 (%s)', (metodo) => {
    const resultado = recalcularIS(entradas, metodo);
    expect(resultado.factores.map((f) => f.il)).toEqual(tesis.factores.map((f) => f.il));
    expect(resultado.factores.map((f) => f.is)).toEqual(tesis.factores.map((f) => f.is));
  });

  it('devuelve r y los cuartiles usados', () => {
    const resultado = recalcularIS(entradas);
    expect(resultado.factores[0]?.r).toBe(4.125);
    expect(resultado.cuartiles.q2).toBeCloseTo(3.65, 10);
  });
});
