import type {
  CalculoImportancia,
  Catalogo,
  FactorCatalogo,
  ValoracionFactor,
} from '../datos/tipos';
import { TEXTOS_RECOMENDACION } from '../guios-core';
import {
  derivarFactor,
  derivarFactores,
  derivarResultados,
  detalleSubfactores,
  type FilaFactor,
  filaParaGuardar,
  filasParaFinalizar,
  recomendacionParaGuardar,
  resumirFactores,
  textoAyudaImportanciaSugerida,
} from './derivar';

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
  subfactores: {},
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

describe('textoAyudaImportanciaSugerida', () => {
  it('explica la IS con IE, IL y el cálculo de origen', () => {
    const fila = derivarFactor(usabilidad, calculo, undefined);
    expect(textoAyudaImportanciaSugerida(fila, calculo.nombre)).toBe(
      'Importancia sugerida = intersección de la importancia del experto (IE = 3) y la de la literatura (IL = 2). Fuente: Cálculo inicial de la tesis.',
    );
  });
});

describe('derivarResultados (RN-08 con guios-core)', () => {
  const ev = (nombre: string, parcial: Partial<FilaFactor>): FilaFactor => ({
    idFactor: 1,
    nombre,
    dimension: 'D',
    alcanceCatalogo: 'Externo',
    alcance: 'Externo',
    totalSubfactores: 1,
    ie: 3,
    il: 3,
    is: 3,
    id: 3,
    ir: 3,
    relevante: true,
    estado: 'evaluado',
    pm: 4,
    foda: 'Oportunidad',
    ...parcial,
  });
  const pendiente = (nombre: string) =>
    ev(nombre, { estado: 'pendiente', pm: null, foda: null, idFactor: 2 });
  const excluido = (nombre: string) =>
    ev(nombre, { id: 1, ir: 1, relevante: false, estado: 'no_relevante', pm: null, foda: null });
  const sinValorar = (nombre: string) =>
    ev(nombre, {
      id: null,
      ir: null,
      relevante: false,
      estado: 'sin_valorar',
      pm: null,
      foda: null,
    });

  it('ningún factor evaluado: sin recomendación', () => {
    const r = derivarResultados([pendiente('P'), excluido('E'), sinValorar('S')]);
    expect(r.recomendacion).toBeNull();
    expect(r.evaluados).toEqual([]);
    expect(r.pendientes.map((f) => f.nombre)).toEqual(['P']);
    expect(r.excluidos.map((f) => f.nombre)).toEqual(['E']);
  });

  it('todos los evaluados son F u O: A, con el texto de la tesis y sin causas', () => {
    const r = derivarResultados([ev('X', {}), ev('Y', { foda: 'Fortaleza', alcance: 'Interno' })]);
    expect(r.recomendacion).toMatchObject({
      codigo: 'A',
      titulo: 'Adoptar el software evaluado',
      causas: [],
    });
  });

  it('una única Debilidad con IR 2 y el resto F u O: B', () => {
    const r = derivarResultados([
      ev('X', {}),
      ev('Débil', { foda: 'Debilidad', ir: 2, pm: 2, alcance: 'Interno' }),
    ]);
    expect(r.recomendacion?.codigo).toBe('B');
    expect(r.recomendacion?.causas).toEqual([{ nombre: 'Débil', foda: 'Debilidad', ir: 2 }]);
  });

  it('una Amenaza con IR 2 y una Debilidad con IR 4: C, causada solo por la de IR ≥ 3', () => {
    const r = derivarResultados([
      ev('Amenaza', { foda: 'Amenaza', ir: 2, pm: 2 }),
      ev('Debilidad', { foda: 'Debilidad', ir: 4, pm: 1, alcance: 'Interno' }),
    ]);
    expect(r.recomendacion?.codigo).toBe('C');
    expect(r.recomendacion?.causas).toEqual([{ nombre: 'Debilidad', foda: 'Debilidad', ir: 4 }]);
  });

  it('un factor relevante con un subfactor sin valorar se excluye; los demás deciden', () => {
    const r = derivarResultados([ev('X', {}), pendiente('Incompleto')]);
    expect(r.recomendacion?.codigo).toBe('A');
    expect(r.pendientes.map((f) => f.nombre)).toEqual(['Incompleto']);
  });

  it('el texto de la recomendación viene de guios-core', () => {
    const r = derivarResultados([ev('X', { foda: 'Amenaza', ir: 3, pm: 2 })]);
    expect(r.recomendacion?.texto).toBe(TEXTOS_RECOMENDACION.C.texto);
  });
});

describe('filasParaFinalizar y recomendacionParaGuardar', () => {
  const evaluado = derivarFactor(
    soporte,
    calculo,
    valoracion({ idFactor: 20, id: 4, cumplimientos: { 200: 2, 201: 3 } }),
  );
  const pendienteDeSubfactor = derivarFactor(
    compatibilidad,
    calculo,
    valoracion({ idFactor: 10, id: 4, cumplimientos: { 100: 4 } }),
  );
  const sinId = derivarFactor(usabilidad, calculo, undefined);

  it('guarda la fotografía de todos los factores con ID, evaluados o no', () => {
    const filas = filasParaFinalizar([evaluado, pendienteDeSubfactor, sinId]);
    expect(filas.map((f) => [f.idFactor, f.pm, f.foda])).toEqual([
      [20, 2.5, 'Debilidad'],
      [10, null, null],
    ]);
  });

  it('la recomendación a guardar lleva código, texto de la tesis y causas', () => {
    const r = derivarResultados([evaluado]);
    expect(recomendacionParaGuardar(r)).toEqual({
      codigo: 'C',
      texto: TEXTOS_RECOMENDACION.C.texto,
      causas: [{ nombre: 'Soporte', foda: 'Debilidad', ir: 3 }],
    });
  });

  it('sin factores evaluados no hay nada que guardar', () => {
    expect(recomendacionParaGuardar(derivarResultados([pendienteDeSubfactor]))).toBeNull();
  });
});

describe('detalleSubfactores', () => {
  const enunciados = { 100: 'Uno', 101: 'Dos' };

  it('lista los subfactores en orden, con su PS y la PM parcial de los ya valorados', () => {
    const detalle = detalleSubfactores(
      compatibilidad,
      enunciados,
      valoracion({ idFactor: 10, cumplimientos: { 101: 2 } }),
    );
    expect(detalle).toEqual({
      subfactores: [
        { id: 100, enunciado: 'Uno', ps: null },
        { id: 101, enunciado: 'Dos', ps: 2 },
      ],
      valorados: 1,
      total: 2,
      pmParcial: 2,
    });
  });

  it('sin valoración ninguno está valorado y no hay PM parcial', () => {
    expect(detalleSubfactores(compatibilidad, enunciados, undefined)).toMatchObject({
      valorados: 0,
      total: 2,
      pmParcial: null,
    });
  });

  it('con todos valorados la PM parcial coincide con la PM exacta, sin redondear', () => {
    const detalle = detalleSubfactores(
      compatibilidad,
      enunciados,
      valoracion({ idFactor: 10, cumplimientos: { 100: 4, 101: 3 } }),
    );
    expect(detalle.pmParcial).toBe(3.5);
  });

  it('un subfactor sin enunciado en el catálogo usa un texto de respaldo', () => {
    expect(detalleSubfactores(compatibilidad, {}, undefined).subfactores[0]?.enunciado).toBe(
      'Subfactor 100',
    );
  });
});
