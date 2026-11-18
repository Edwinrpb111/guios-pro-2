import type { Catalogo, ResumenEvaluacion } from '../datos/tipos';
import {
  filtrarHistorial,
  formatearFecha,
  porcentajeAvance,
  rutaDeContinuacion,
  rutaDeEvaluacion,
} from './historial';

const catalogo: Catalogo = {
  subfactores: {},
  dimensiones: [
    {
      id: 1,
      nombre: 'Tecnológica',
      factores: [
        {
          id: 10,
          nombre: 'Compatibilidad',
          alcance: 'Externo',
          orden: 1,
          idsSubfactores: [1, 2, 3, 4],
        },
        { id: 11, nombre: 'Usabilidad', alcance: 'Externo', orden: 2, idsSubfactores: [5, 6] },
        { id: 12, nombre: 'Prueba', alcance: 'Externo', orden: 3, idsSubfactores: [7] },
      ],
    },
  ],
};

const evaluacion = (parcial: Partial<ResumenEvaluacion> = {}): ResumenEvaluacion => ({
  id: 5,
  titulo: 'Plataforma de aprendizaje',
  estado: 'en_curso',
  codigo: null,
  fecha: '2026-10-08T15:00:00Z',
  software: { nombre: 'Moodle', version: '4.4', licencia: 'GPL v3' },
  organizacion: 'Universidad Estatal de Milagro',
  factoresValorados: [],
  ...parcial,
});

describe('porcentajeAvance', () => {
  it('sin nada valorado es 0 %', () => {
    expect(porcentajeAvance(evaluacion(), catalogo)).toBe(0);
  });

  it('pondera 40 % los factores asignados y 60 % los subfactores de los relevantes', () => {
    // 3/3 factores asignados → 40 %; relevantes 10 (4 subfactores) y 11 (2): 3 de 6 → 30 %.
    const e = evaluacion({
      factoresValorados: [
        { idFactor: 10, relevante: true, subfactoresValorados: 3 },
        { idFactor: 11, relevante: true, subfactoresValorados: 0 },
        { idFactor: 12, relevante: false, subfactoresValorados: 0 },
      ],
    });
    expect(porcentajeAvance(e, catalogo)).toBe(70);
  });

  it('sin factores relevantes solo cuenta la asignación de importancias', () => {
    const e = evaluacion({
      factoresValorados: [{ idFactor: 12, relevante: false, subfactoresValorados: 0 }],
    });
    expect(porcentajeAvance(e, catalogo)).toBe(13); // 1/3 × 40 %
  });

  it('con todo valorado llega a 100 %', () => {
    const e = evaluacion({
      factoresValorados: [
        { idFactor: 10, relevante: true, subfactoresValorados: 4 },
        { idFactor: 11, relevante: true, subfactoresValorados: 2 },
        { idFactor: 12, relevante: true, subfactoresValorados: 1 },
      ],
    });
    expect(porcentajeAvance(e, catalogo)).toBe(100);
  });

  it('ignora factores que ya no están en el catálogo', () => {
    const e = evaluacion({
      factoresValorados: [{ idFactor: 999, relevante: true, subfactoresValorados: 5 }],
    });
    expect(porcentajeAvance(e, catalogo)).toBe(0);
  });
});

describe('rutaDeContinuacion', () => {
  it('una evaluación finalizada abre los resultados', () => {
    expect(rutaDeContinuacion(evaluacion({ estado: 'finalizada' }), 3)).toBe(
      '/evaluaciones/5/resultados',
    );
  });

  it('sin software registrado vuelve al contexto', () => {
    expect(rutaDeContinuacion(evaluacion({ software: null }), 3)).toBe('/evaluaciones/5/contexto');
  });

  it('con factores sin valorar abre los factores', () => {
    const e = evaluacion({
      factoresValorados: [{ idFactor: 10, relevante: true, subfactoresValorados: 0 }],
    });
    expect(rutaDeContinuacion(e, 3)).toBe('/evaluaciones/5/factores');
  });

  it('con todos los factores valorados abre los subfactores', () => {
    const e = evaluacion({
      factoresValorados: [10, 11, 12].map((idFactor) => ({
        idFactor,
        relevante: false,
        subfactoresValorados: 0,
      })),
    });
    expect(rutaDeContinuacion(e, 3)).toBe('/evaluaciones/5/subfactores');
  });
});

describe('rutaDeEvaluacion', () => {
  it('arma la ruta de cada paso', () => {
    expect(rutaDeEvaluacion(7, 'contexto')).toBe('/evaluaciones/7/contexto');
    expect(rutaDeEvaluacion(7, 'factores')).toBe('/evaluaciones/7/factores');
    expect(rutaDeEvaluacion(7, 'subfactores')).toBe('/evaluaciones/7/subfactores');
    expect(rutaDeEvaluacion(7, 'resultados')).toBe('/evaluaciones/7/resultados');
  });

  it('arma la ruta del informe imprimible', () => {
    expect(rutaDeEvaluacion(7, 'informe')).toBe('/evaluaciones/7/informe');
  });
});

describe('formatearFecha', () => {
  it('usa día/mes/año con ceros', () => {
    expect(formatearFecha('2026-10-03T15:00:00Z')).toBe('03/10/2026');
  });
});

describe('filtrarHistorial', () => {
  const lista = [
    evaluacion({ id: 1, titulo: 'Adopción de LibreOffice', estado: 'finalizada' }),
    evaluacion({ id: 2, titulo: 'Plataforma de aprendizaje' }),
    evaluacion({
      id: 3,
      titulo: 'ERP administrativo',
      software: { nombre: 'Odoo Community', version: '17', licencia: 'LGPL v3' },
      organizacion: 'Hospital Central',
    }),
  ];

  it('sin filtros devuelve todo', () => {
    expect(filtrarHistorial(lista, { estado: 'todas', texto: '' })).toHaveLength(3);
  });

  it('filtra por estado', () => {
    expect(filtrarHistorial(lista, { estado: 'finalizada', texto: '' }).map((e) => e.id)).toEqual([
      1,
    ]);
    expect(filtrarHistorial(lista, { estado: 'en_curso', texto: '' }).map((e) => e.id)).toEqual([
      2, 3,
    ]);
  });

  it('busca por título, software u organización sin distinguir mayúsculas ni tildes', () => {
    expect(
      filtrarHistorial(lista, { estado: 'todas', texto: 'adopcion' }).map((e) => e.id),
    ).toEqual([1]);
    expect(filtrarHistorial(lista, { estado: 'todas', texto: 'ODOO' }).map((e) => e.id)).toEqual([
      3,
    ]);
    expect(
      filtrarHistorial(lista, { estado: 'todas', texto: 'hospital' }).map((e) => e.id),
    ).toEqual([3]);
  });

  it('combina estado y texto', () => {
    expect(filtrarHistorial(lista, { estado: 'finalizada', texto: 'erp' })).toEqual([]);
  });
});
