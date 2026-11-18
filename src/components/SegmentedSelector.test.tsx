import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedSelector, type OpcionSelector } from './SegmentedSelector';

const importancia: OpcionSelector<number>[] = [
  { valor: 1, etiqueta: 'Irrelevante' },
  { valor: 2, etiqueta: 'Opcional' },
  { valor: 3, etiqueta: 'Importante' },
  { valor: 4, etiqueta: 'Fundamental' },
];

function Controlado({ inicial = null }: { inicial?: number | null }) {
  const [valor, setValor] = useState<number | null>(inicial);
  return (
    <SegmentedSelector
      etiqueta="Importancia del factor"
      opciones={importancia}
      valor={valor}
      onCambiar={setValor}
    />
  );
}

describe('SegmentedSelector', () => {
  it('expone un radiogroup con una opción por valor y marca la seleccionada', () => {
    render(
      <SegmentedSelector
        etiqueta="Importancia del factor"
        opciones={importancia}
        valor={3}
        onCambiar={() => {}}
      />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Importancia del factor' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'Importante' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Opcional' })).not.toBeChecked();
  });

  it('selecciona con un solo clic y emite el valor', async () => {
    const onCambiar = vi.fn();
    render(
      <SegmentedSelector
        etiqueta="Importancia"
        opciones={importancia}
        valor={null}
        onCambiar={onCambiar}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Fundamental' }));
    expect(onCambiar).toHaveBeenCalledTimes(1);
    expect(onCambiar).toHaveBeenCalledWith(4);
  });

  it('en modo controlado refleja la selección tras un clic', async () => {
    render(<Controlado />);
    await userEvent.click(screen.getByRole('radio', { name: 'Opcional' }));
    expect(screen.getByRole('radio', { name: 'Opcional' })).toBeChecked();
  });

  it('no vuelve a emitir al hacer clic en la opción ya seleccionada', async () => {
    const onCambiar = vi.fn();
    render(
      <SegmentedSelector
        etiqueta="Importancia"
        opciones={importancia}
        valor={2}
        onCambiar={onCambiar}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Opcional' }));
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('funciona con valores de texto', async () => {
    const onCambiar = vi.fn();
    render(
      <SegmentedSelector
        etiqueta="Alcance de Soporte"
        opciones={[
          { valor: 'Interno', etiqueta: 'Interno' },
          { valor: 'Externo', etiqueta: 'Externo' },
        ]}
        valor="Interno"
        onCambiar={onCambiar}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Externo' }));
    expect(onCambiar).toHaveBeenCalledWith('Externo');
  });

  it('usa foco itinerante: solo la opción seleccionada entra en el orden de tabulación', async () => {
    render(
      <>
        <button type="button">antes</button>
        <SegmentedSelector
          etiqueta="Importancia"
          opciones={importancia}
          valor={3}
          onCambiar={() => {}}
        />
        <button type="button">después</button>
      </>,
    );
    expect(screen.getByRole('radio', { name: 'Importante' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Opcional' })).toHaveAttribute('tabindex', '-1');
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'Importante' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'después' })).toHaveFocus();
  });

  it('sin valor seleccionado, la primera opción es la parada de tabulación', () => {
    render(
      <SegmentedSelector
        etiqueta="Importancia"
        opciones={importancia}
        valor={null}
        onCambiar={() => {}}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Irrelevante' })).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('radio').filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });

  it('las flechas mueven el foco y seleccionan, con vuelta circular', async () => {
    render(<Controlado inicial={4} />);
    screen.getByRole('radio', { name: 'Fundamental' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Irrelevante' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Irrelevante' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Fundamental' })).toBeChecked();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('radio', { name: 'Importante' })).toBeChecked();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Fundamental' })).toBeChecked();
  });

  it('Inicio y Fin saltan a la primera y última opción', async () => {
    render(<Controlado inicial={2} />);
    screen.getByRole('radio', { name: 'Opcional' }).focus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'Fundamental' })).toBeChecked();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: 'Irrelevante' })).toBeChecked();
  });

  it('Enter y Espacio activan la opción enfocada', async () => {
    const onCambiar = vi.fn();
    render(
      <SegmentedSelector
        etiqueta="Importancia"
        opciones={importancia}
        valor={null}
        onCambiar={onCambiar}
      />,
    );
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onCambiar).toHaveBeenLastCalledWith(1);
    await userEvent.keyboard(' ');
    expect(onCambiar).toHaveBeenCalledTimes(2);
  });

  it('ignora otras teclas', async () => {
    const onCambiar = vi.fn();
    render(
      <SegmentedSelector
        etiqueta="Importancia"
        opciones={importancia}
        valor={2}
        onCambiar={onCambiar}
      />,
    );
    screen.getByRole('radio', { name: 'Opcional' }).focus();
    await userEvent.keyboard('a');
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('deshabilitado: no emite por clic ni por teclado', async () => {
    const onCambiar = vi.fn();
    render(
      <SegmentedSelector
        etiqueta="Importancia"
        opciones={importancia}
        valor={2}
        onCambiar={onCambiar}
        deshabilitado
      />,
    );
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('radio', { name: 'Fundamental' })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: 'Fundamental' }));
    await userEvent.keyboard('{ArrowRight}');
    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('asocia la ayuda de cada opción como descripción accesible', () => {
    render(
      <SegmentedSelector
        etiqueta="Cumplimiento"
        opciones={[
          { valor: 1, etiqueta: 'No cumple', ayuda: 'No cumple el requisito' },
          { valor: 2, etiqueta: 'No sé' },
        ]}
        valor={null}
        onCambiar={() => {}}
      />,
    );
    expect(screen.getByRole('radio', { name: 'No cumple' })).toHaveAccessibleDescription(
      'No cumple el requisito',
    );
    expect(screen.getByRole('radio', { name: 'No sé' })).not.toHaveAccessibleDescription();
  });

  it('el texto de cada nivel siempre es visible (el color nunca va solo)', () => {
    render(<Controlado inicial={1} />);
    for (const { etiqueta } of importancia) {
      expect(screen.getByText(etiqueta)).toBeVisible();
    }
  });
});
