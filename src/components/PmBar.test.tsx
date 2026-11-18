import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatearPm } from './formato';
import { PmBar } from './PmBar';

describe('formatearPm', () => {
  it.each([
    [3.25, '3,25'],
    [3, '3,00'],
    [1, '1,00'],
    [2.666666, '2,67'],
  ])('formatea %s como %s', (n, esperado) => {
    expect(formatearPm(n)).toBe(esperado);
  });

  it.each([null, undefined])('formatea %s como raya', (n) => {
    expect(formatearPm(n)).toBe('—');
  });
});

describe('PmBar', () => {
  it('muestra la ponderación con dos decimales y coma', () => {
    render(<PmBar valor={3.25} />);
    expect(screen.getByText('3,25')).toBeInTheDocument();
    const medidor = screen.getByRole('meter');
    expect(medidor).toHaveAttribute('aria-valuenow', '3.25');
    expect(medidor).toHaveAttribute('aria-valuemin', '1');
    expect(medidor).toHaveAttribute('aria-valuemax', '4');
  });

  it('marca el umbral 3 y lo anuncia en el texto accesible', () => {
    render(<PmBar valor={2.5} />);
    expect(screen.getByText('umbral 3,0')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAccessibleName('Ponderación media');
    expect(screen.getByRole('meter')).toHaveAttribute(
      'aria-valuetext',
      expect.stringContaining('bajo el umbral'),
    );
    expect(screen.getByTestId('pm-umbral').style.left).toMatch(/^66\.6+\d*%$/);
  });

  it('con valor en el umbral o sobre él lo indica en texto', () => {
    render(<PmBar valor={3} />);
    expect(screen.getByRole('meter')).toHaveAttribute(
      'aria-valuetext',
      expect.stringContaining('en o sobre el umbral'),
    );
  });

  it('el relleno es proporcional al valor (1 → 0 %, 4 → 100 %)', () => {
    const { rerender } = render(<PmBar valor={1} />);
    expect(screen.getByTestId('pm-relleno')).toHaveStyle({ width: '0%' });
    rerender(<PmBar valor={4} />);
    expect(screen.getByTestId('pm-relleno')).toHaveStyle({ width: '100%' });
  });

  it('sin valor muestra raya y no declara aria-valuenow', () => {
    render(<PmBar valor={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByRole('meter')).not.toHaveAttribute('aria-valuenow');
  });

  it('marca el valor como parcial', () => {
    render(<PmBar valor={3.5} parcial />);
    expect(screen.getByText('Ponderación media (parcial)')).toBeInTheDocument();
  });

  it('muestra la clasificación FODA con texto cuando se entrega', () => {
    render(<PmBar valor={3.5} foda="Fortaleza" />);
    expect(screen.getByText('Fortaleza')).toBeInTheDocument();
  });

  it('variante compacta: nombre, barra y valor, con FODA en texto', () => {
    render(<PmBar variante="compacta" nombre="Soporte" valor={4} foda="Oportunidad" />);
    expect(screen.getByText('Soporte')).toBeInTheDocument();
    expect(screen.getByText('4,00')).toBeInTheDocument();
    expect(screen.getByText('Oportunidad')).toBeInTheDocument();
    expect(screen.getByRole('meter')).toHaveAccessibleName('Soporte');
  });
});
