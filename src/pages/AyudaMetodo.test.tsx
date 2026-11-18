import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { IMPORTANCIA, TEXTOS_RECOMENDACION } from '../guios-core';
import { AyudaMetodo } from './AyudaMetodo';

describe('AyudaMetodo (P-11)', () => {
  it('es un botón en la cabecera que abre el modal global del método', async () => {
    render(<AyudaMetodo />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ayuda del método' }));
    expect(screen.getByRole('dialog', { name: 'Ayuda del método GUIOS' })).toBeInTheDocument();
  });

  it('toma los nombres de los niveles y los textos de las recomendaciones de guios-core', async () => {
    render(<AyudaMetodo />);
    await userEvent.click(screen.getByRole('button', { name: 'Ayuda del método' }));
    const dialogo = screen.getByRole('dialog');
    const escala = within(dialogo).getByRole('list', { name: 'Escala de importancia' });
    for (const [valor, nombre] of Object.entries(IMPORTANCIA)) {
      expect(escala).toHaveTextContent(`${valor} · ${nombre}`);
    }
    expect(dialogo).toHaveTextContent(TEXTOS_RECOMENDACION.A.texto);
    expect(dialogo).toHaveTextContent(TEXTOS_RECOMENDACION.C.titulo);
  });

  it('se cierra con Escape y devuelve el foco al botón', async () => {
    render(<AyudaMetodo />);
    const boton = screen.getByRole('button', { name: 'Ayuda del método' });
    await userEvent.click(boton);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(boton).toHaveFocus();
  });
});
