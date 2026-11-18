import {
  ALCANCE_SOPORTE_POR_DEFECTO,
  UMBRAL_FODA,
  UMBRAL_RELEVANCIA,
  alcanceEfectivo,
  clasificarFoda,
  esRelevante,
  evaluarFactor,
  interseccion,
  ponderacionMedia,
  recomendar,
  type EntradaFactor,
} from './reglas';
import casosInterseccion from './fixtures/interseccion.json';
import piloto from './fixtures/piloto_libreoffice.json';
import bordes from './fixtures/recomendacion_bordes.json';
import type { Importancia } from './escalas';

const evaluarTodos = (factores: readonly unknown[]) =>
  (factores as EntradaFactor[]).map(evaluarFactor);

describe('interseccion (RN-02, RN-10) — fixture §6.1', () => {
  it.each(casosInterseccion.casos)('interseccion($a, $b) = $esperado', ({ a, b, esperado }) => {
    expect(interseccion(a as Importancia, b as Importancia)).toBe(esperado);
  });

  it('cubre los 16 casos', () => {
    expect(casosInterseccion.casos).toHaveLength(16);
  });

  it('rechaza valores fuera de la escala 1..4', () => {
    expect(() => interseccion(0 as Importancia, 2)).toThrow(RangeError);
    expect(() => interseccion(2, 5 as Importancia)).toThrow(RangeError);
  });
});

describe('esRelevante (RN-03)', () => {
  it('usa el umbral con nombre IR > 1', () => {
    expect(UMBRAL_RELEVANCIA).toBe(1);
    expect(esRelevante(1)).toBe(false);
    expect(esRelevante(2)).toBe(true);
    expect(esRelevante(4)).toBe(true);
  });
});

describe('alcanceEfectivo (RN-04)', () => {
  it('Soporte ("Ambos") toma el alcance elegido, por defecto Interno', () => {
    expect(ALCANCE_SOPORTE_POR_DEFECTO).toBe('Interno');
    expect(alcanceEfectivo('Ambos')).toBe('Interno');
    expect(alcanceEfectivo('Ambos', 'Externo')).toBe('Externo');
  });

  it('los factores con alcance fijo ignoran la elección', () => {
    expect(alcanceEfectivo('Externo', 'Interno')).toBe('Externo');
    expect(alcanceEfectivo('Interno', 'Externo')).toBe('Interno');
  });
});

describe('ponderacionMedia (RN-06)', () => {
  it('es el promedio aritmético exacto, sin redondear', () => {
    expect(ponderacionMedia([2, 3, 2, 1, 2, 3])).toBeCloseTo(13 / 6, 12);
    expect(ponderacionMedia([4])).toBe(4);
  });

  it('es null si falta algún PS o no hay subfactores', () => {
    expect(ponderacionMedia([4, null, 3])).toBeNull();
    expect(ponderacionMedia([])).toBeNull();
  });

  it('rechaza PS fuera de 1..4 (0 no es "sin valor")', () => {
    expect(() => ponderacionMedia([0 as 1, 4])).toThrow(RangeError);
  });
});

describe('clasificarFoda (RN-07)', () => {
  it('umbral 3 sobre la PM exacta', () => {
    expect(UMBRAL_FODA).toBe(3);
    expect(clasificarFoda(3, 'Interno')).toBe('Fortaleza');
    expect(clasificarFoda(2.999, 'Interno')).toBe('Debilidad');
    expect(clasificarFoda(3, 'Externo')).toBe('Oportunidad');
    expect(clasificarFoda(2.999, 'Externo')).toBe('Amenaza');
  });
});

describe('evaluarFactor', () => {
  it('un factor no relevante no se valora', () => {
    expect(evaluarFactor({ nombre: 'X', alcance: 'Externo', is: 2, id: 1, ps: [1, 1] })).toEqual({
      nombre: 'X',
      ir: 1,
      relevante: false,
      pm: null,
      foda: null,
      estado: 'no_relevante',
    });
  });

  it('un factor relevante a medio valorar queda pendiente', () => {
    expect(evaluarFactor({ nombre: 'X', alcance: 'Interno', is: 3, id: 3, ps: [4, null] })).toEqual(
      {
        nombre: 'X',
        ir: 3,
        relevante: true,
        pm: null,
        foda: null,
        estado: 'pendiente',
      },
    );
  });
});

describe('caso piloto LibreOffice–UNEMI — fixture §6.3', () => {
  const resultados = evaluarTodos(piloto.factores);

  it('tiene los 18 factores', () => {
    expect(resultados).toHaveLength(18);
  });

  it.each(Object.entries(piloto.fodaEsperado))('%s: %j', (foda, nombres) => {
    const obtenidos = resultados.filter((r) => r.foda === foda).map((r) => r.nombre);
    expect(obtenidos).toEqual(nombres);
  });

  it('recomienda C con sus causas', () => {
    expect(recomendar(resultados)).toEqual(piloto.recomendacionEsperada);
  });
});

describe('recomendar (RN-08) — fixture §6.4', () => {
  it('cubre los 6 casos borde', () => {
    expect(bordes.casos).toHaveLength(6);
  });

  it.each(bordes.casos)('$situacion', (caso) => {
    const resultados = evaluarTodos(caso.factores);
    expect(recomendar(resultados)).toEqual(caso.esperado);
    if ('fodaEsperado' in caso) {
      expect(resultados[0]?.foda).toBe(caso.fodaEsperado);
    }
  });

  it('sin factores no hay recomendación', () => {
    expect(recomendar([])).toBeNull();
  });
});
