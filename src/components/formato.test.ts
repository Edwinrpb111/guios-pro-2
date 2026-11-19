import { describe, expect, it } from 'vitest';
import { formatearEntero, formatearRestante } from './formato';

describe('formatearRestante (issue #45, S16f)', () => {
  it.each([
    [0, 'menos de 1 min'],
    [59_000, 'menos de 1 min'],
    [60_000, 'aprox. 1 min'],
    [100_000, 'aprox. 2 min'],
    [590_000, 'aprox. 10 min'],
    [3_540_000, 'aprox. 59 min'],
    [3_600_000, 'aprox. 1 h'],
    [4_500_000, 'aprox. 1 h 15 min'],
  ])('%i ms se lee «%s»', (ms, texto) => {
    expect(formatearRestante(ms)).toBe(texto);
  });

  it('una estimación ausente o inválida es una raya', () => {
    expect(formatearRestante(null)).toBe('—');
    expect(formatearRestante(Number.NaN)).toBe('—');
    expect(formatearRestante(-1)).toBe('—');
  });
});

describe('formatearEntero', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1234, '1.234'],
    [4000000, '4.000.000'],
    [1234.6, '1.235'],
  ])('%d se lee «%s»', (valor, texto) => {
    expect(formatearEntero(valor)).toBe(texto);
  });
});
