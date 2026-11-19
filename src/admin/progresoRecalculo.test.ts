import { describe, expect, it } from 'vitest';
import { calcularProgreso } from './progresoRecalculo';
import type { PasoRegistro } from './tipos';

function paso(id: number, parcial: Partial<PasoRegistro> = {}): PasoRegistro {
  return {
    idSubfactor: id,
    nombre: `Subfactor ${id}`,
    estado: 'hecho',
    iniciadoEn: '2026-11-22T10:00:00Z',
    duracionMs: 10_000,
    candidatos: 10,
    aceptados: 3,
    detalle: null,
    registro: null,
    ...parcial,
  };
}

const EN_CURSO = (id: number) =>
  paso(id, { estado: 'pendiente', duracionMs: null, nombre: 'Comunidad activa' });

describe('calcularProgreso (issue #45, S16f)', () => {
  it('cuenta los subfactores hechos sobre el total del catálogo', () => {
    const r = calcularProgreso({
      pasos: [paso(3), paso(2), paso(1)],
      totalSubfactores: 60,
      pendientes: null,
      corriendo: true,
    });
    expect(r.hechos).toBe(3);
    expect(r.total).toBe(60);
  });

  it('el paso en curso es el actual y no cuenta como hecho', () => {
    const r = calcularProgreso({
      pasos: [EN_CURSO(4), paso(3), paso(2)],
      totalSubfactores: 10,
      pendientes: null,
      corriendo: true,
    });
    expect(r.actual).toBe('Comunidad activa');
    expect(r.hechos).toBe(2);
  });

  it('sin el recálculo corriendo no hay subfactor actual (un paso sin duración quedó cortado)', () => {
    const r = calcularProgreso({
      pasos: [EN_CURSO(4), paso(3)],
      totalSubfactores: 10,
      pendientes: null,
      corriendo: false,
    });
    expect(r.actual).toBeNull();
    expect(r.restanteMs).toBeNull();
  });

  it('sin nombre el actual se llama «Subfactor n»', () => {
    const r = calcularProgreso({
      pasos: [{ ...EN_CURSO(7), nombre: null }],
      totalSubfactores: 10,
      pendientes: null,
      corriendo: true,
    });
    expect(r.actual).toBe('Subfactor 7');
  });

  it('el tiempo restante es el promedio de los últimos 5 pasos por los subfactores que faltan', () => {
    // Del más reciente al más antiguo: 5 pasos de 10 s y uno viejo de 100 s que no entra.
    const pasos = [paso(6), paso(5), paso(4), paso(3), paso(2), paso(1, { duracionMs: 100_000 })];
    const r = calcularProgreso({ pasos, totalSubfactores: 16, pendientes: null, corriendo: true });
    expect(r.restanteMs).toBe(100_000); // 10 faltan × 10 s
  });

  it('sin ningún paso hecho todavía no hay estimación', () => {
    const r = calcularProgreso({
      pasos: [EN_CURSO(1)],
      totalSubfactores: 10,
      pendientes: null,
      corriendo: true,
    });
    expect(r.restanteMs).toBeNull();
  });

  it('un paso hecho sin duración no entra en el promedio', () => {
    const r = calcularProgreso({
      pasos: [paso(2, { duracionMs: null }), paso(1, { duracionMs: 20_000 })],
      totalSubfactores: 4,
      pendientes: null,
      corriendo: true,
    });
    expect(r.restanteMs).toBe(40_000);
  });

  it('con `pendientes` del servidor no baja de lo que ese dato indica (el registro puede ir atrasado)', () => {
    const r = calcularProgreso({
      pasos: [paso(1)],
      totalSubfactores: 10,
      pendientes: 6,
      corriendo: true,
    });
    expect(r.hechos).toBe(4);
    expect(r.restanteMs).toBe(60_000);
  });

  it('sin catálogo el total sale de hechos + pendientes', () => {
    const r = calcularProgreso({
      pasos: [paso(2), paso(1)],
      totalSubfactores: null,
      pendientes: 8,
      corriendo: true,
    });
    expect(r.total).toBe(10);
    expect(r.hechos).toBe(2);
  });

  it('sin catálogo ni pendientes no se conoce el total ni la estimación', () => {
    const r = calcularProgreso({
      pasos: [paso(1)],
      totalSubfactores: null,
      pendientes: null,
      corriendo: true,
    });
    expect(r.total).toBeNull();
    expect(r.restanteMs).toBeNull();
    expect(r.hechos).toBe(1);
  });

  it('nunca pasa del total ni da un tiempo restante negativo', () => {
    const r = calcularProgreso({
      pasos: [paso(3), paso(2), paso(1)],
      totalSubfactores: 2,
      pendientes: 0,
      corriendo: true,
    });
    expect(r.hechos).toBe(2);
    expect(r.restanteMs).toBe(0);
  });

  it('un catálogo vacío cuenta como total desconocido', () => {
    const r = calcularProgreso({
      pasos: [],
      totalSubfactores: 0,
      pendientes: null,
      corriendo: true,
    });
    expect(r.total).toBeNull();
  });
});
