import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FodaChip } from './FodaChip';

describe('FodaChip', () => {
  it.each(['Fortaleza', 'Debilidad', 'Oportunidad', 'Amenaza'] as const)(
    'muestra el texto de la clasificación %s (no solo color)',
    (foda) => {
      render(<FodaChip foda={foda} />);
      const chip = screen.getByText(foda);
      expect(chip).toBeVisible();
      expect(chip).toHaveAttribute('data-foda', foda);
    },
  );

  it.each([undefined, null])('muestra "Sin evaluar" cuando foda es %s', (foda) => {
    render(<FodaChip foda={foda} />);
    expect(screen.getByText('Sin evaluar')).toHaveAttribute('data-foda', 'Sin evaluar');
  });
});
