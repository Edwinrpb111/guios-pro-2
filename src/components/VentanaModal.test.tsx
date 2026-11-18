import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { VentanaModal } from './VentanaModal';

function Ejemplo({ alCerrar = vi.fn() }: { alCerrar?: () => void }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)}>
        Abrir
      </button>
      <VentanaModal
        abierta={abierta}
        titulo="Ayuda del método"
        onCerrar={() => {
          alCerrar();
          setAbierta(false);
        }}
      >
        <p>Contenido</p>
        <button type="button">Acción interna</button>
      </VentanaModal>
    </>
  );
}

describe('VentanaModal', () => {
  it('cerrada no dibuja nada', () => {
    render(<VentanaModal abierta={false} titulo="Título" onCerrar={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('abierta es un diálogo modal con nombre accesible y contenido', async () => {
    render(<Ejemplo />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialogo = screen.getByRole('dialog', { name: 'Ayuda del método' });
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(dialogo).toHaveTextContent('Contenido');
  });

  it('al abrir lleva el foco al botón de cerrar y al cerrar lo devuelve a quien la abrió', async () => {
    render(<Ejemplo />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });
    await userEvent.click(abrir);
    expect(screen.getByRole('button', { name: 'Cerrar' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(abrir).toHaveFocus();
  });

  it('Escape, el botón Cerrar y un clic en el fondo la cierran', async () => {
    const alCerrar = vi.fn();
    render(<Ejemplo alCerrar={alCerrar} />);
    const abrir = screen.getByRole('button', { name: 'Abrir' });

    await userEvent.click(abrir);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(abrir);
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    await userEvent.click(abrir);
    await userEvent.click(screen.getByTestId('fondo-modal'));

    expect(alCerrar).toHaveBeenCalledTimes(3);
  });

  it('un clic dentro del diálogo no la cierra', async () => {
    const alCerrar = vi.fn();
    render(<Ejemplo alCerrar={alCerrar} />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    await userEvent.click(screen.getByText('Contenido'));
    expect(alCerrar).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('el foco no sale del diálogo con Tab ni con Mayús+Tab', async () => {
    render(<Ejemplo />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const cerrar = screen.getByRole('button', { name: 'Cerrar' });
    const interna = screen.getByRole('button', { name: 'Acción interna' });

    await userEvent.tab();
    expect(interna).toHaveFocus();
    await userEvent.tab();
    expect(cerrar).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(interna).toHaveFocus();
  });

  it('el resto de la página queda oculto para los lectores de pantalla mientras está abierta', async () => {
    render(<Ejemplo />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.queryByRole('button', { name: 'Abrir' })).not.toBeInTheDocument();
  });
});
