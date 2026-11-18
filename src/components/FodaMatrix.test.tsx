import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FodaMatrix, type FactorFoda } from './FodaMatrix';

const factores: FactorFoda[] = [
  { id: 'f1', nombre: 'Compatibilidad', foda: 'Fortaleza', ir: 'Importante', pm: 3.25 },
  { id: 'f2', nombre: 'Soporte', foda: 'Fortaleza', ir: 'Fundamental', pm: 4 },
  { id: 'f3', nombre: 'Formación', foda: 'Debilidad', ir: 'Fundamental', pm: 2 },
  { id: 'f4', nombre: 'Bloqueo de proveedores', foda: 'Amenaza', ir: 'Opcional' },
];

describe('FodaMatrix', () => {
  it('muestra los cuatro cuadrantes con su conteo', () => {
    render(<FodaMatrix factores={factores} />);
    expect(screen.getByRole('group', { name: 'Matriz FODA' })).toBeInTheDocument();
    const fortalezas = screen.getByRole('region', { name: /Fortalezas/ });
    expect(within(fortalezas).getAllByRole('listitem')).toHaveLength(2);
    expect(within(fortalezas).getByText('2')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: /Debilidades/ })).getAllByRole('listitem'),
    ).toHaveLength(1);
    expect(
      within(screen.getByRole('region', { name: /Amenazas/ })).getAllByRole('listitem'),
    ).toHaveLength(1);
    expect(screen.getByRole('region', { name: /Oportunidades/ })).toBeInTheDocument();
  });

  it('muestra nombre, importancia relativa y ponderación con coma decimal', () => {
    render(<FodaMatrix factores={factores} />);
    const fortalezas = screen.getByRole('region', { name: /Fortalezas/ });
    expect(within(fortalezas).getByText('Compatibilidad')).toBeInTheDocument();
    expect(within(fortalezas).getByText('Importante')).toBeInTheDocument();
    expect(within(fortalezas).getByText('3,25')).toBeInTheDocument();
  });

  it('indica con texto el cuadrante vacío', () => {
    render(<FodaMatrix factores={factores} />);
    const oportunidades = screen.getByRole('region', { name: /Oportunidades/ });
    expect(within(oportunidades).getByText('Sin factores')).toBeInTheDocument();
    expect(within(oportunidades).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('permite personalizar el texto de cuadrante vacío', () => {
    render(<FodaMatrix factores={[]} textoVacio="—" />);
    expect(screen.getAllByText('—')).toHaveLength(4);
  });

  it('rotula los ejes (interno/externo, ponderación)', () => {
    render(<FodaMatrix factores={[]} />);
    expect(screen.getByText('Interno')).toBeInTheDocument();
    expect(screen.getByText('Externo')).toBeInTheDocument();
    expect(screen.getByText('Ponderación ≥ 3')).toBeInTheDocument();
    expect(screen.getByText('Ponderación < 3')).toBeInTheDocument();
  });

  it('emite el id del factor al activarlo (con clic y con teclado)', async () => {
    const onSeleccionarFactor = vi.fn();
    render(<FodaMatrix factores={factores} onSeleccionarFactor={onSeleccionarFactor} />);
    await userEvent.click(screen.getByRole('button', { name: /Compatibilidad/ }));
    expect(onSeleccionarFactor).toHaveBeenCalledWith('f1');
    screen.getByRole('button', { name: /Formación/ }).focus();
    await userEvent.keyboard('{Enter}');
    expect(onSeleccionarFactor).toHaveBeenLastCalledWith('f3');
  });

  it('sin manejador, los factores no son botones', () => {
    render(<FodaMatrix factores={factores} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
