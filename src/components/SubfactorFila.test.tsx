import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubfactorFila, type SubfactorFilaProps } from './SubfactorFila';

const base: SubfactorFilaProps = {
  numero: 3,
  enunciado: 'Existe soporte profesional disponible',
  valor: null,
  onCambiar: () => {},
};

const opcion = (nombre: string) => screen.getByRole('radio', { name: nombre });

describe('SubfactorFila', () => {
  it('muestra el número y el enunciado con las cuatro opciones de cumplimiento', () => {
    render(<SubfactorFila {...base} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Existe soporte profesional disponible')).toBeInTheDocument();
    const grupo = screen.getByRole('radiogroup', {
      name: 'Cumplimiento: Existe soporte profesional disponible',
    });
    expect(grupo).toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((o) => o.textContent)).toEqual([
      'No cumple el requisito',
      'Desconozco si cumple',
      'Cumple parcialmente',
      'Cumple el requisito',
    ]);
  });

  it('sin valor no hay opción marcada y se indica que falta', () => {
    render(<SubfactorFila {...base} />);
    for (const o of screen.getAllByRole('radio'))
      expect(o).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Sin valorar')).toBeInTheDocument();
  });

  it('un clic emite el nivel de cumplimiento', async () => {
    const onCambiar = vi.fn();
    render(<SubfactorFila {...base} onCambiar={onCambiar} />);
    await userEvent.click(opcion('Cumple parcialmente'));
    expect(onCambiar).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('marca la opción valorada y no vuelve a emitirla', async () => {
    const onCambiar = vi.fn();
    render(<SubfactorFila {...base} valor={4} onCambiar={onCambiar} />);
    expect(opcion('Cumple el requisito')).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('Sin valorar')).not.toBeInTheDocument();
    await userEvent.click(opcion('Cumple el requisito'));
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('deshabilitado no permite cambiar', async () => {
    const onCambiar = vi.fn();
    render(<SubfactorFila {...base} valor={1} deshabilitado onCambiar={onCambiar} />);
    for (const o of screen.getAllByRole('radio')) expect(o).toBeDisabled();
    await userEvent.click(opcion('Cumple el requisito'));
    expect(onCambiar).not.toHaveBeenCalled();
  });
});
