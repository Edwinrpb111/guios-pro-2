import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BottomBar } from './BottomBar';

describe('BottomBar', () => {
  it('muestra atrás, acción secundaria y principal, y emite eventos', async () => {
    const onAtras = vi.fn();
    const onSecundaria = vi.fn();
    const onPrincipal = vi.fn();
    render(
      <BottomBar
        onAtras={onAtras}
        etiquetaSecundaria="Guardar borrador"
        onSecundaria={onSecundaria}
        etiquetaPrincipal="Ver resultados"
        onPrincipal={onPrincipal}
      />,
    );
    expect(screen.getByRole('region', { name: 'Acciones del paso' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Atrás/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await userEvent.click(screen.getByRole('button', { name: /Ver resultados/ }));
    expect(onAtras).toHaveBeenCalledTimes(1);
    expect(onSecundaria).toHaveBeenCalledTimes(1);
    expect(onPrincipal).toHaveBeenCalledTimes(1);
  });

  it('omite los botones cuya acción no se entrega', () => {
    render(<BottomBar etiquetaPrincipal="Siguiente" onPrincipal={() => {}} />);
    expect(screen.queryByRole('button', { name: /Atrás/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar borrador' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Siguiente/ })).toBeInTheDocument();
  });

  it('el botón principal deshabilitado no emite', async () => {
    const onPrincipal = vi.fn();
    render(
      <BottomBar etiquetaPrincipal="Siguiente" onPrincipal={onPrincipal} principalDeshabilitado />,
    );
    const boton = screen.getByRole('button', { name: /Siguiente/ });
    expect(boton).toBeDisabled();
    await userEvent.click(boton);
    expect(onPrincipal).not.toHaveBeenCalled();
  });

  it('atrás y secundaria pueden deshabilitarse', () => {
    render(
      <BottomBar
        onAtras={() => {}}
        atrasDeshabilitado
        etiquetaSecundaria="Guardar"
        onSecundaria={() => {}}
        secundariaDeshabilitada
      />,
    );
    expect(screen.getByRole('button', { name: /Atrás/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('el botón principal es alcanzable con teclado y se activa con Enter', async () => {
    const onPrincipal = vi.fn();
    render(<BottomBar etiquetaPrincipal="Siguiente" onPrincipal={onPrincipal} />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: /Siguiente/ })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onPrincipal).toHaveBeenCalledTimes(1);
  });

  it('acepta acciones adicionales como hijos', () => {
    render(
      <BottomBar>
        <button type="button">Exportar PDF</button>
      </BottomBar>,
    );
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeInTheDocument();
  });
});
