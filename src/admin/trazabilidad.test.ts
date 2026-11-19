import { describe, expect, it } from 'vitest';
import { ordenarPorConfianza, sinDatosDeClasificacion } from './trazabilidad';

const ref = (id: number, confianza: number | null) => ({ id, confianza });

describe('ordenarPorConfianza', () => {
  it('ordena de mayor a menor confianza sin tocar la lista original', () => {
    const original = [ref(1, 0.4), ref(2, 0.9), ref(3, 0.7)];
    expect(ordenarPorConfianza(original).map((r) => r.id)).toEqual([2, 3, 1]);
    expect(original.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it('deja al final las que no tienen confianza y conserva el orden en los empates', () => {
    const lista = [ref(1, null), ref(2, 0.5), ref(3, 0.5), ref(4, null), ref(5, 0)];
    expect(ordenarPorConfianza(lista).map((r) => r.id)).toEqual([2, 3, 5, 1, 4]);
  });
});

describe('sinDatosDeClasificacion', () => {
  it('es verdadero si todas las aceptadas tienen confianza nula y no hay rechazadas', () => {
    expect(sinDatosDeClasificacion([ref(1, null), ref(2, null)], [])).toBe(true);
  });

  it('es falso si alguna aceptada tiene confianza (incluso 0)', () => {
    expect(sinDatosDeClasificacion([ref(1, null), ref(2, 0)], [])).toBe(false);
  });

  it('es falso si hay algún rechazado, aunque las aceptadas no tengan confianza', () => {
    expect(sinDatosDeClasificacion([ref(1, null)], [ref(9, null)])).toBe(false);
  });
});
