import type { FilaFactor } from './derivar';
import { pasosDeEvaluacion, situacionDePasos } from './pasos';

const fila = (parcial: Partial<FilaFactor>): FilaFactor => ({
  idFactor: 1,
  nombre: 'F',
  dimension: 'D',
  alcanceCatalogo: 'Externo',
  alcance: 'Externo',
  totalSubfactores: 1,
  ie: 3,
  il: 3,
  is: 3,
  id: null,
  ir: null,
  relevante: false,
  estado: 'sin_valorar',
  pm: null,
  foda: null,
  ...parcial,
});

describe('situacionDePasos', () => {
  it('sin factores valorados solo cuenta el software', () => {
    expect(situacionDePasos([fila({}), fila({ idFactor: 2 })], true, false)).toEqual({
      tieneSoftware: true,
      todosAsignados: false,
      subfactoresCompletos: false,
      finalizada: false,
    });
  });

  it('con todos asignados pero sin relevantes los subfactores no están completos', () => {
    const filas = [fila({ id: 1, ir: 1, estado: 'no_relevante' })];
    expect(situacionDePasos(filas, true, false)).toMatchObject({
      todosAsignados: true,
      subfactoresCompletos: false,
    });
  });

  it('los subfactores están completos cuando todos los relevantes están evaluados', () => {
    const evaluado = fila({ id: 3, ir: 3, relevante: true, estado: 'evaluado', pm: 4 });
    const pendiente = fila({ id: 3, ir: 3, relevante: true, estado: 'pendiente' });
    const excluido = fila({ id: 1, ir: 1, estado: 'no_relevante' });
    expect(situacionDePasos([evaluado, excluido], true, false).subfactoresCompletos).toBe(true);
    expect(situacionDePasos([evaluado, pendiente], true, false).subfactoresCompletos).toBe(false);
  });

  it('un catálogo vacío no cuenta como asignado', () => {
    expect(situacionDePasos([], false, false).todosAsignados).toBe(false);
  });
});

describe('pasosDeEvaluacion', () => {
  it('solo se habilita el paso siguiente cuando el anterior está completo', () => {
    const inicial = pasosDeEvaluacion({
      tieneSoftware: false,
      todosAsignados: false,
      subfactoresCompletos: false,
      finalizada: false,
    });
    expect(inicial.map((p) => [p.id, p.habilitado])).toEqual([
      ['contexto', true],
      ['factores', false],
      ['subfactores', false],
      ['resultados', false],
    ]);
  });

  it('con todo completo habilita todos y marca los completados', () => {
    const pasos = pasosDeEvaluacion({
      tieneSoftware: true,
      todosAsignados: true,
      subfactoresCompletos: true,
      finalizada: true,
    });
    expect(pasos.every((p) => p.habilitado && p.completado)).toBe(true);
  });

  it('los resultados se habilitan con los subfactores completos aunque no esté finalizada', () => {
    const pasos = pasosDeEvaluacion({
      tieneSoftware: true,
      todosAsignados: true,
      subfactoresCompletos: true,
      finalizada: false,
    });
    expect(pasos[3]).toMatchObject({ habilitado: true, completado: false });
  });

  it('los resultados se pueden ver con factores pendientes: el pendiente se excluye (RN-08)', () => {
    const pasos = pasosDeEvaluacion({
      tieneSoftware: true,
      todosAsignados: true,
      subfactoresCompletos: false,
      finalizada: false,
    });
    expect(pasos[3]).toMatchObject({ habilitado: true, completado: false });
  });

  it('sin todos los factores asignados los resultados siguen bloqueados', () => {
    const pasos = pasosDeEvaluacion({
      tieneSoftware: true,
      todosAsignados: false,
      subfactoresCompletos: false,
      finalizada: false,
    });
    expect(pasos[3]).toMatchObject({ habilitado: false });
  });
});
