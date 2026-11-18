import tesis from '../guios-core/fixtures/is_tesis.json';
import {
  compararIS,
  estaSinTerminar,
  filasDesdeConteo,
  nombreCalculo,
  rangoCalculo,
  textoEstado,
} from './resultado';
import type { CalculoResumen } from './tipos';

const BASE: CalculoResumen = {
  id: 2,
  origen: 'ia',
  anioInicio: 2020,
  anioFin: 2025,
  etiquetaRango: null,
  basesDatos: 'OpenAlex, Crossref',
  fecha: '2026-11-18T10:00:00Z',
  vigente: false,
  estado: 'en_proceso',
  progreso: 0,
  mensajeError: null,
  parametros: null,
};

describe('filasDesdeConteo', () => {
  it('calcula con guios-core las filas que guarda guardar_resultado_calculo (Tabla 5.3)', () => {
    const conteos = tesis.factores.map((f, i) => ({
      idFactor: i + 1,
      subfactores: f.ns,
      citas: f.tc,
    }));
    const filas = filasDesdeConteo(conteos);
    expect(filas).toHaveLength(18);
    expect(filas.map((f) => f.is)).toEqual(tesis.factores.map((f) => f.is));
    expect(filas.map((f) => f.il)).toEqual(tesis.factores.map((f) => f.il));
    expect(filas[0]).toEqual({
      idFactor: 1,
      subfactores: 8,
      citas: 33,
      razon: 4.125,
      ie: 3,
      il: 3,
      is: 3,
    });
  });

  it('redondea la razón a 4 decimales para guardarla, sin cambiar la clasificación', () => {
    const filas = filasDesdeConteo([
      { idFactor: 1, subfactores: 3, citas: 1 },
      { idFactor: 2, subfactores: 3, citas: 2 },
    ]);
    expect(filas.map((f) => f.razon)).toEqual([0.3333, 0.6667]);
  });
});

describe('compararIS', () => {
  it('indica si la IS nueva sube, baja o se mantiene respecto de la vigente', () => {
    expect(compararIS(3, 2)).toBe('sube');
    expect(compararIS(2, 3)).toBe('baja');
    expect(compararIS(2, 2)).toBe('igual');
    expect(compararIS(2, undefined)).toBeNull();
  });
});

describe('nombreCalculo y rangoCalculo', () => {
  it('nombran el cálculo de la tesis y los recálculos con IA', () => {
    expect(nombreCalculo({ ...BASE, origen: 'tesis' })).toBe('Cálculo inicial de la tesis');
    expect(nombreCalculo(BASE)).toBe('Recálculo IA 2020–2025');
    expect(rangoCalculo({ ...BASE, origen: 'tesis', etiquetaRango: 'RSL de la tesis' })).toBe(
      'RSL de la tesis',
    );
    expect(rangoCalculo({ ...BASE, origen: 'tesis' })).toBe('—');
    expect(rangoCalculo(BASE)).toBe('2020–2025');
  });
});

describe('textoEstado y estaSinTerminar', () => {
  it('distingue el vigente del histórico y nombra cada estado', () => {
    expect(textoEstado({ ...BASE, estado: 'publicado', vigente: true })).toBe('Vigente');
    expect(textoEstado({ ...BASE, estado: 'publicado' })).toBe('Histórico');
    expect(textoEstado(BASE)).toBe('En proceso');
    expect(textoEstado({ ...BASE, estado: 'pausado' })).toBe('Pausado');
    expect(textoEstado({ ...BASE, estado: 'completado' })).toBe('Listo para revisar');
    expect(textoEstado({ ...BASE, estado: 'descartado' })).toBe('Descartado');
    expect(textoEstado({ ...BASE, estado: 'fallido' })).toBe('Fallido');
  });

  it('un cálculo sin terminar se puede continuar desde P-09', () => {
    expect(estaSinTerminar(BASE)).toBe(true);
    expect(estaSinTerminar({ ...BASE, estado: 'pausado' })).toBe(true);
    expect(estaSinTerminar({ ...BASE, estado: 'completado' })).toBe(true);
    expect(estaSinTerminar({ ...BASE, estado: 'publicado' })).toBe(false);
    expect(estaSinTerminar({ ...BASE, estado: 'descartado' })).toBe(false);
  });
});
