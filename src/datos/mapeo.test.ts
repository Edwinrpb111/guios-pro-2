import {
  mapearCalculo,
  mapearCatalogo,
  mapearEvaluacion,
  mapearResumen,
  nombreDeCalculo,
} from './mapeo';

describe('nombreDeCalculo', () => {
  it('el cálculo de la tesis y el de IA tienen su propio nombre', () => {
    expect(nombreDeCalculo({ origen: 'tesis', anio_inicio: null, anio_fin: null })).toBe(
      'Cálculo inicial de la tesis',
    );
    expect(nombreDeCalculo({ origen: 'ia', anio_inicio: 2020, anio_fin: 2025 })).toBe(
      'Recálculo IA 2020–2025',
    );
  });
});

describe('mapearCatalogo', () => {
  it('ordena dimensiones, factores y subfactores y valida el alcance', () => {
    const catalogo = mapearCatalogo([
      {
        id_dimension: 1,
        nombre: 'Tecnológica',
        factor: [
          {
            id_factor: 2,
            nombre: 'B',
            alcance: 'Ambos',
            orden: 2,
            subfactor: [
              { id_subfactor: 22, orden: 2 },
              { id_subfactor: 21, orden: 1 },
            ],
          },
          { id_factor: 1, nombre: 'A', alcance: 'Externo', orden: 1, subfactor: [] },
        ],
      },
    ]);
    const factores = catalogo.dimensiones[0]?.factores;
    expect(factores?.map((f) => f.nombre)).toEqual(['A', 'B']);
    expect(factores?.[1]).toMatchObject({ alcance: 'Ambos', idsSubfactores: [21, 22] });
  });

  it('rechaza un alcance desconocido', () => {
    expect(() =>
      mapearCatalogo([
        {
          id_dimension: 1,
          nombre: 'T',
          factor: [{ id_factor: 1, nombre: 'A', alcance: 'Otro', orden: 1, subfactor: [] }],
        },
      ]),
    ).toThrow(/alcance/i);
  });
});

describe('mapearCalculo', () => {
  const fila = {
    id_calculo: 1,
    origen: 'tesis',
    anio_inicio: null,
    anio_fin: null,
    etiqueta_rango: 'RSL de la tesis',
    bases_datos: 'IEEE, ACM',
    fecha_calculo: '2022-06-01T12:00:00Z',
  };

  it('arma el resumen con la etiqueta de rango, o con los años si no la hay', () => {
    expect(mapearCalculo(fila)).toEqual({
      id: 1,
      nombre: 'Cálculo inicial de la tesis',
      rango: 'RSL de la tesis',
      fecha: '2022-06-01T12:00:00Z',
      bases: 'IEEE, ACM',
    });
    expect(
      mapearCalculo({
        ...fila,
        origen: 'ia',
        etiqueta_rango: null,
        anio_inicio: 2020,
        anio_fin: 2025,
      }),
    ).toMatchObject({ nombre: 'Recálculo IA 2020–2025', rango: '2020–2025' });
  });

  it('incluye la IS por factor cuando viene en la fila', () => {
    const calculo = mapearCalculo({
      ...fila,
      sugerida_factor: [
        {
          id_factor: 5,
          importancia_experto: 3,
          importancia_literatura: 1,
          importancia_sugerida: 2,
        },
      ],
    });
    expect(calculo).toMatchObject({ porFactor: { 5: { ie: 3, il: 1, is: 2 } } });
  });

  it('rechaza una importancia fuera de 1..4', () => {
    expect(() =>
      mapearCalculo({
        ...fila,
        sugerida_factor: [
          {
            id_factor: 5,
            importancia_experto: 3,
            importancia_literatura: 1,
            importancia_sugerida: 7,
          },
        ],
      }),
    ).toThrow(/importancia/i);
  });
});

describe('mapearResumen', () => {
  it('trata un software sin nombre como no registrado y cuenta los subfactores valorados', () => {
    const resumen = mapearResumen({
      id_evaluacion: 4,
      titulo: null,
      estado: 'en_curso',
      codigo_recomendacion: null,
      fecha_actualizacion: '2026-10-08T15:00:00Z',
      software_evaluado: { nombre: '', version: null, tipo_licencia: null, organizacion: null },
      valoracion_factor: [
        {
          id_factor: 1,
          es_relevante: true,
          valoracion_subfactor: [{ id_subfactor: 1 }, { id_subfactor: 2 }],
        },
      ],
    });
    expect(resumen).toEqual({
      id: 4,
      titulo: '',
      estado: 'en_curso',
      codigo: null,
      fecha: '2026-10-08T15:00:00Z',
      software: null,
      organizacion: null,
      factoresValorados: [{ idFactor: 1, relevante: true, subfactoresValorados: 2 }],
    });
  });

  it('lleva software, organización y código de recomendación', () => {
    const resumen = mapearResumen({
      id_evaluacion: 4,
      titulo: 'Adopción',
      estado: 'finalizada',
      codigo_recomendacion: 'C',
      fecha_actualizacion: '2026-10-08T15:00:00Z',
      software_evaluado: {
        nombre: 'Moodle',
        version: '4.4',
        tipo_licencia: 'GPL v3',
        organizacion: { nombre: 'UNEMI' },
      },
      valoracion_factor: [],
    });
    expect(resumen).toMatchObject({
      estado: 'finalizada',
      codigo: 'C',
      software: { nombre: 'Moodle', version: '4.4', licencia: 'GPL v3' },
      organizacion: 'UNEMI',
    });
  });

  it('rechaza un estado o un código desconocido', () => {
    const base = {
      id_evaluacion: 4,
      titulo: 'x',
      estado: 'en_curso',
      codigo_recomendacion: null,
      fecha_actualizacion: '2026-10-08T15:00:00Z',
      software_evaluado: null,
      valoracion_factor: [],
    };
    expect(() => mapearResumen({ ...base, estado: 'borrada' })).toThrow(/estado/i);
    expect(() => mapearResumen({ ...base, codigo_recomendacion: 'Z' })).toThrow(/recomendación/i);
  });
});

describe('mapearEvaluacion', () => {
  it('sin software el contexto queda vacío y con él trae organización y cumplimientos', () => {
    const vacia = mapearEvaluacion({
      id_evaluacion: 1,
      titulo: null,
      estado: 'en_curso',
      id_calculo: 9,
      software_evaluado: null,
      valoracion_factor: [],
    });
    expect(vacia.contexto).toEqual({
      titulo: '',
      software: { id: null, nombre: '', version: '', licencia: '' },
      organizacion: { id: null, nombre: '', sector: '', pais: '' },
    });
    expect(vacia.idCalculo).toBe(9);

    const llena = mapearEvaluacion({
      id_evaluacion: 1,
      titulo: 'T',
      estado: 'en_curso',
      id_calculo: 9,
      software_evaluado: {
        id_software: 3,
        nombre: 'S',
        version: '1',
        tipo_licencia: 'MIT',
        organizacion: { id_organizacion: 8, nombre: 'O', sector: 'Salud', pais: 'Perú' },
      },
      valoracion_factor: [
        {
          id_factor: 2,
          importancia_decisor: 3,
          alcance_aplicado: 'Externo',
          valoracion_subfactor: [{ id_subfactor: 20, nivel_cumplimiento: 4 }],
        },
      ],
    });
    expect(llena.contexto).toEqual({
      titulo: 'T',
      software: { id: 3, nombre: 'S', version: '1', licencia: 'MIT' },
      organizacion: { id: 8, nombre: 'O', sector: 'Salud', pais: 'Perú' },
    });
    expect(llena.valoraciones).toEqual([
      { idFactor: 2, id: 3, alcance: 'Externo', cumplimientos: { 20: 4 } },
    ]);
  });

  it('rechaza un nivel de cumplimiento o un alcance aplicado inválidos', () => {
    const base = {
      id_evaluacion: 1,
      titulo: null,
      estado: 'en_curso',
      id_calculo: 9,
      software_evaluado: null,
    };
    expect(() =>
      mapearEvaluacion({
        ...base,
        valoracion_factor: [
          {
            id_factor: 2,
            importancia_decisor: 3,
            alcance_aplicado: 'Ambos',
            valoracion_subfactor: [],
          },
        ],
      }),
    ).toThrow(/alcance/i);
    expect(() =>
      mapearEvaluacion({
        ...base,
        valoracion_factor: [
          {
            id_factor: 2,
            importancia_decisor: 3,
            alcance_aplicado: 'Interno',
            valoracion_subfactor: [{ id_subfactor: 1, nivel_cumplimiento: 9 }],
          },
        ],
      }),
    ).toThrow(/cumplimiento/i);
  });
});
