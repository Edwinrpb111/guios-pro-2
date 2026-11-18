import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressRing } from './ProgressRing';

describe('ProgressRing', () => {
  it('es una barra de progreso accesible con porcentaje', () => {
    render(<ProgressRing completados={3} total={4} etiqueta="Progreso de Compatibilidad" />);
    const anillo = screen.getByRole('progressbar', { name: 'Progreso de Compatibilidad' });
    expect(anillo).toHaveAttribute('aria-valuemin', '0');
    expect(anillo).toHaveAttribute('aria-valuemax', '100');
    expect(anillo).toHaveAttribute('aria-valuenow', '75');
    expect(anillo).toHaveAttribute('aria-valuetext', '3 de 4 (75 %)');
    expect(screen.getByText('3/4')).toBeInTheDocument();
  });

  it('con total cero el progreso es 0 %', () => {
    render(<ProgressRing completados={0} total={0} />);
    expect(screen.getByRole('progressbar', { name: 'Progreso' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
  });

  it('limita el avance a 100 % y marca el estado completo', () => {
    render(<ProgressRing completados={9} total={5} />);
    const anillo = screen.getByRole('progressbar');
    expect(anillo).toHaveAttribute('aria-valuenow', '100');
    expect(anillo).toHaveAttribute('data-completo', 'true');
  });

  it('incompleto no se marca como completo', () => {
    render(<ProgressRing completados={1} total={5} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-completo', 'false');
  });
});
