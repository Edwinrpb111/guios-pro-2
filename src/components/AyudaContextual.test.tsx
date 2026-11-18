import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AyudaContextual } from './AyudaContextual';

describe('AyudaContextual', () => {
  it('es un botón enfocable cuyo texto de ayuda es su descripción accesible', async () => {
    render(
      <AyudaContextual
        etiqueta="Ayuda sobre la importancia sugerida"
        texto="IS = intersección de IE e IL."
      />,
    );
    const boton = screen.getByRole('button', { name: 'Ayuda sobre la importancia sugerida' });
    expect(boton).toHaveAccessibleDescription('IS = intersección de IE e IL.');
    await userEvent.tab();
    expect(boton).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('IS = intersección de IE e IL.');
  });

  it('Escape cierra la ayuda sin mover el foco', async () => {
    render(<AyudaContextual etiqueta="Ayuda" texto="Texto" />);
    const boton = screen.getByRole('button', { name: 'Ayuda' });
    await userEvent.tab();
    await userEvent.keyboard('{Escape}');
    expect(boton).toHaveFocus();
    expect(boton).toHaveAttribute('data-cerrada', 'true');
  });
});
