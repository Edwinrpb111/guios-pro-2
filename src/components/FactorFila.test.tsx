import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FactorFila, type FactorFilaProps } from './FactorFila';

const base: FactorFilaProps = {
  nombre: 'Compatibilidad',
  totalSubfactores: 8,
  alcance: 'Externo',
  alcanceEditable: false,
  importanciaSugerida: 3,
  ayudaSugerida: 'IS = intersección de IE (3) e IL (3).',
  importanciaDecisor: null,
  importanciaRelativa: null,
  relevante: false,
  onCambiarImportancia: () => {},
  onCambiarAlcance: () => {},
};

describe('FactorFila', () => {
  it('muestra el nombre, el número de subfactores y el alcance fijo', () => {
    render(<FactorFila {...base} />);
    expect(screen.getByText('Compatibilidad')).toBeInTheDocument();
    expect(screen.getByText('8 subfactores')).toBeInTheDocument();
    expect(screen.getByText('Externo')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: /alcance/i })).not.toBeInTheDocument();
  });

  it('usa el singular con un solo subfactor', () => {
    render(<FactorFila {...base} totalSubfactores={1} />);
    expect(screen.getByText('1 subfactor')).toBeInTheDocument();
  });

  it('muestra la IS vigente con su ayuda', () => {
    render(<FactorFila {...base} importanciaSugerida={2} />);
    expect(screen.getByText('Opcional', { selector: 'b' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /ayuda sobre la importancia sugerida/i }),
    ).toHaveAccessibleDescription(base.ayudaSugerida);
  });

  it('sin importancia del decisor invita a asignarla y no marca relevancia', () => {
    render(<FactorFila {...base} />);
    expect(screen.getByText('Asigna tu importancia')).toBeInTheDocument();
    expect(screen.queryByText('● Relevante')).not.toBeInTheDocument();
    expect(screen.queryByText(/Se excluye/)).not.toBeInTheDocument();
    for (const opcion of screen.getAllByRole('radio'))
      expect(opcion).toHaveAttribute('aria-checked', 'false');
  });

  it('un clic en un nivel emite la importancia elegida', async () => {
    const onCambiarImportancia = vi.fn();
    render(<FactorFila {...base} onCambiarImportancia={onCambiarImportancia} />);
    await userEvent.click(
      within(
        screen.getByRole('radiogroup', { name: 'Importancia del factor Compatibilidad' }),
      ).getByRole('radio', { name: 'Fundamental' }),
    );
    expect(onCambiarImportancia).toHaveBeenCalledWith(4);
  });

  it('muestra la importancia relativa y, con texto, si el factor es relevante', () => {
    render(<FactorFila {...base} importanciaDecisor={4} importanciaRelativa={3} relevante />);
    expect(screen.getByRole('radio', { name: 'Fundamental' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(
      screen.getByText('Importante', { selector: 'b.factor-fila__ir-valor' }),
    ).toBeInTheDocument();
    expect(screen.getByText('● Relevante')).toBeInTheDocument();
  });

  it('un factor no relevante se indica como excluido, también con texto', () => {
    render(
      <FactorFila {...base} importanciaDecisor={1} importanciaRelativa={1} relevante={false} />,
    );
    expect(screen.getByText(/Se excluye/)).toBeInTheDocument();
  });

  it('un factor «Ambos» ofrece el alcance Interno/Externo y emite el cambio', async () => {
    const onCambiarAlcance = vi.fn();
    render(
      <FactorFila
        {...base}
        nombre="Soporte"
        alcance="Interno"
        alcanceEditable
        onCambiarAlcance={onCambiarAlcance}
      />,
    );
    const grupo = screen.getByRole('radiogroup', { name: 'Alcance del factor Soporte' });
    expect(within(grupo).getByRole('radio', { name: 'Interno' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(within(grupo).getByRole('radio', { name: 'Externo' }));
    expect(onCambiarAlcance).toHaveBeenCalledWith('Externo');
  });

  it('deshabilitada no deja cambiar nada', async () => {
    const onCambiarImportancia = vi.fn();
    render(<FactorFila {...base} deshabilitado onCambiarImportancia={onCambiarImportancia} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Importante' }));
    expect(onCambiarImportancia).not.toHaveBeenCalled();
  });
});
