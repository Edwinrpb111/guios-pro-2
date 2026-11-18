import type {
  CalculoImportancia,
  Catalogo,
  FactorCatalogo,
  ValoracionFactor,
} from '../datos/tipos';
import { derivarFactor, derivarFactores, filaParaGuardar, resumirFactores } from './derivar';

const compatibilidad: FactorCatalogo = {
  id: 10,
  nombre: 'Compatibilidad',
  alcance: 'Externo',
  orden: 1,
  idsSubfactores: [100, 101],
};
const usabilidad: FactorCatalogo = {
  id: 11,
  nombre: 'Usabilidad',
  alcance: 'Externo',
  orden: 2,
  idsSubfactores: [110],
};
const soporte: FactorCatalogo = {
  id: 20,
  nombre: 'Soporte',
  alcance: 'Ambos',
  orden: 1,
  idsSubfactores: [200, 201],
};

const catalogo: Catalogo = {
  dimensiones: [
    { id: 1, nombre: 'Tecnológica', factores: [compatibilidad, usabilidad] },
    { id: 2, nombre: 'Organizacional', factores: [soporte] },
  ],
};

const calculo: CalculoImportancia = {
  id: 1,
  nombre: 'Cálculo inicial de la tesis',
  rango: 'RSL de la tesis',
  fecha: '2022-06-01T12:00:00Z',
  bases: 'IEEE, ACM, Scopus, WoS',
  porFactor: {
    10: { ie: 3, il: 3, is: 3 },
    11: { ie: 3, il: 2, is: 2 },
    20: { ie: 3, il: 4, is: 3 },
  },
};

const valoracion = (
  parcial: Partial<ValoracionFactor> & { idFactor: number },
): ValoracionFactor => ({
  id: 3,
  alcance: 'Interno',
  cumplimientos: {},
  ...parcial,
});

describe('derivarFactor', () => {
  it('sin valoración del decisor el factor queda sin valorar y muestra su IS', () => {
    const fila = derivarFactor(compatibilidad, calculo, undefined);
    expect(fila).toMatchObject({
      idFactor: 10,
      nombre: 'Compatibilidad',
      totalSubfactores: 2,
      is: 3,
      ie: 3,
      il: 3,
      id: null,
      ir: null,
      relevante: false,
      estado: 'sin_valorar',
      pm: null,
      foda: null,
    });
  });

  it('IR = floor((IS + ID) / 2) con guios-core: IS 3 e ID 4 → 3, relevante', () => {
    const fila = derivarFactor(compatibilidad, calculo, valoracion({ idFactor: 10, id: 4 }));
    expect(fila).toMatchObject({ id: 4, ir: 3, relevante: true, estado: 'pendiente' });
  });

  it('IS 2 e ID 1 → IR 1: el factor no es relevante y se excluye', () => {
    const fila = derivarFactor(usabilidad, calculo, valoracion({ idFactor: 11, id: 1 }));
    expect(fila).toMatchObject({ ir: 1, relevante: false, estado: 'no_relevante', pm: null });
  });

  it('IS 3 e ID 1 → IR 2: relevante (IR > 1, RN-03)', () => {
    const fila = derivarFactor(compatibilidad, calculo, valoracion({ idFactor: 10, id: 1 }));
    expect(fila).toMatchObject({ ir: 2, relevante: true });
  });

  it('el alcance de Soporte es Interno por defecto y se puede elegir Externo (RN-04)', () => {
    expect(derivarFactor(soporte, calculo, undefined).alcance).toBe('Interno');
    expect(
      derivarFactor(soporte, calculo, valoracion({ idFactor: 20, alcance: 'Externo' })).alcance,
    ).toBe('Externo');
  });

  it('un factor de alcance fijo ignora el alcance guardado', () => {
    const fila = derivarFactor(
      compatibilidad,
      calculo,
      valoracion({ idFactor: 10, alcance: 'Interno' }),
    );
    expect(fila.alcance).toBe('Externo');
  });

  it('la elección previa de alcance de Soporte rige hasta que exista la valoración', () => {
    expect(derivarFactor(soporte, calculo, undefined, 'Externo').alcance).toBe('Externo');
    const guardada = valoracion({ idFactor: 20, alcance: 'Interno' });
    expect(derivarFactor(soporte, calculo, guardada, 'Externo').alcance).toBe('Interno');
  });

  it('con todos los subfactores valorados calcula PM sin redondear y FODA', () => {
    const fila = derivarFactor(
      soporte,
      calculo,
      valoracion({ idFactor: 20, id: 3, cumplimientos: { 200: 4, 201: 3 } }),
    );
    expect(fila).toMatchObject({ estado: 'evaluado', pm: 3.5, foda: 'Fortaleza' });
  });

  it('si falta algún subfactor queda pendiente, sin PM ni FODA', () => {
    const fila = derivarFactor(
      soporte,
      calculo,
      valoracion({ idFactor: 20, id: 3, cumplimientos: { 200: 4 } }),
    );
    expect(fila).toMatchObject({ estado: 'pendiente', pm: null, foda: null });
  });

  it('falla si el cálculo no trae el factor', () => {
    expect(() => derivarFactor(soporte, { ...calculo, porFactor: {} }, undefined)).toThrow(
      /Soporte/,
    );
  });
});

describe('derivarFactores y resumirFactores', () => {
  it('recorre el catálogo en orden y resume valorados y relevantes', () => {
    const filas = derivarFactores(catalogo, calculo, [
      valoracion({ idFactor: 10, id: 4 }),
      valoracion({ idFactor: 11, id: 1 }),
    ]);
    expect(filas.map((f) => f.nombre)).toEqual(['Compatibilidad', 'Usabilidad', 'Soporte']);
    expect(resumirFactores(filas)).toEqual({ valorados: 2, relevantes: 1, total: 3 });
  });

  it('agrupa por dimensión conservando el nombre', () => {
    const filas = derivarFactores(catalogo, calculo, []);
    expect(filas.map((f) => f.dimension)).toEqual(['Tecnológica', 'Tecnológica', 'Organizacional']);
  });
});

describe('filaParaGuardar', () => {
  it('lleva la entrada del decisor y los derivados calculados por guios-core', () => {
    const fila = derivarFactor(
      soporte,
      calculo,
      valoracion({ idFactor: 20, id: 4, alcance: 'Externo', cumplimientos: { 200: 2, 201: 2 } }),
    );
    expect(filaParaGuardar(fila)).toEqual({
      idFactor: 20,
      id: 4,
      alcance: 'Externo',
      ir: 3,
      relevante: true,
      pm: 2,
      foda: 'Amenaza',
    });
  });

  it('no se puede guardar un factor sin importancia del decisor', () => {
    expect(() => filaParaGuardar(derivarFactor(soporte, calculo, undefined))).toThrow(
      /sin valorar/,
    );
  });
});
