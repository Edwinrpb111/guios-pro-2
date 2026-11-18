import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Stepper, type PasoStepper } from './Stepper';

const pasos: PasoStepper[] = [
  { id: 'contexto', titulo: 'Contexto', subtitulo: 'Software y organización', completado: true },
  { id: 'factores', titulo: 'Factores', subtitulo: 'Pasos 1 y 2', completado: true },
  { id: 'subfactores', titulo: 'Subfactores', subtitulo: 'Pasos 3 y 4' },
  { id: 'resultados', titulo: 'Resultados', subtitulo: 'Pasos 5 y 6' },
];

describe('Stepper', () => {
  it('lista los pasos y marca el actual con aria-current', () => {
    render(<Stepper pasos={pasos} actual="subfactores" />);
    const nav = screen.getByRole('navigation', { name: 'Pasos de la evaluación' });
    expect(within(nav).getAllByRole('listitem')).toHaveLength(4);
    expect(within(nav).getByRole('button', { name: /Subfactores/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(within(nav).getByRole('button', { name: /Factores/ })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('indica el estado completado con texto, no solo color', () => {
    render(<Stepper pasos={pasos} actual="subfactores" />);
    expect(screen.getByRole('button', { name: /Contexto.*completado/ })).toBeInTheDocument();
  });

  it('los pasos completados emiten el evento con su id', async () => {
    const onIrAPaso = vi.fn();
    render(<Stepper pasos={pasos} actual="subfactores" onIrAPaso={onIrAPaso} />);
    await userEvent.click(screen.getByRole('button', { name: /Contexto/ }));
    expect(onIrAPaso).toHaveBeenCalledWith('contexto');
    screen.getByRole('button', { name: /Factores/ }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onIrAPaso).toHaveBeenLastCalledWith('factores');
  });

  it('los pasos futuros no completados están deshabilitados y no emiten', async () => {
    const onIrAPaso = vi.fn();
    render(<Stepper pasos={pasos} actual="subfactores" onIrAPaso={onIrAPaso} />);
    const futuro = screen.getByRole('button', { name: /Resultados/ });
    expect(futuro).toBeDisabled();
    await userEvent.click(futuro);
    expect(onIrAPaso).not.toHaveBeenCalled();
  });

  it('el paso actual no emite evento', async () => {
    const onIrAPaso = vi.fn();
    render(<Stepper pasos={pasos} actual="subfactores" onIrAPaso={onIrAPaso} />);
    await userEvent.click(screen.getByRole('button', { name: /Subfactores/ }));
    expect(onIrAPaso).not.toHaveBeenCalled();
  });

  it('respeta `habilitado` explícito sobre el valor por defecto', async () => {
    const onIrAPaso = vi.fn();
    render(
      <Stepper
        pasos={[
          { id: 'a', titulo: 'A' },
          { id: 'b', titulo: 'B', habilitado: true },
          { id: 'c', titulo: 'C', completado: true, habilitado: false },
        ]}
        actual="a"
        onIrAPaso={onIrAPaso}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^B/ }));
    expect(onIrAPaso).toHaveBeenCalledWith('b');
    expect(screen.getByRole('button', { name: /^C/ })).toBeDisabled();
  });

  it('incluye la versión móvil reducida con "Paso n de N" y barra de progreso', () => {
    render(<Stepper pasos={pasos} actual="subfactores" />);
    expect(screen.getByText('Paso 3 de 4')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Avance de la evaluación' })).toHaveAttribute(
      'aria-valuenow',
      '75',
    );
  });

  it('con un paso actual desconocido no falla y muestra paso 0', () => {
    render(<Stepper pasos={pasos} actual="inexistente" />);
    expect(screen.getByText('Paso 0 de 4')).toBeInTheDocument();
  });
});
