import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistorialTabla, type FilaHistorial } from './HistorialTabla';

const finalizada: FilaHistorial = {
  id: 1,
  titulo: 'Adopción de LibreOffice',
  detalle: 'LibreOffice 7.x · MPL 2.0',
  organizacion: 'Universidad Estatal de Milagro',
  fecha: '03/10/2026',
  estado: 'finalizada',
  avance: 100,
  recomendacion: 'C',
};
const enCurso: FilaHistorial = {
  id: 2,
  titulo: 'Plataforma de aprendizaje',
  detalle: 'Moodle 4.4 · GPL v3',
  organizacion: 'Universidad Estatal de Milagro',
  fecha: '08/10/2026',
  estado: 'en_curso',
  avance: 67,
  recomendacion: null,
};

describe('HistorialTabla', () => {
  it('muestra una fila por evaluación con título, detalle, organización y fecha', () => {
    render(<HistorialTabla filas={[finalizada, enCurso]} onAbrir={() => {}} />);
    expect(screen.getAllByRole('row')).toHaveLength(3); // encabezado + 2
    const fila = screen.getByRole('row', { name: /Adopción de LibreOffice/ });
    expect(within(fila).getByText('LibreOffice 7.x · MPL 2.0')).toBeInTheDocument();
    expect(within(fila).getByText('Universidad Estatal de Milagro')).toBeInTheDocument();
    expect(within(fila).getByText('03/10/2026')).toBeInTheDocument();
  });

  it('el estado y la recomendación llevan texto, no solo color', () => {
    render(<HistorialTabla filas={[finalizada, enCurso]} onAbrir={() => {}} />);
    expect(screen.getByText('Finalizada')).toBeInTheDocument();
    expect(screen.getByText('En curso · 67 %')).toBeInTheDocument();
    expect(screen.getByLabelText('Recomendación C')).toHaveTextContent('C');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('«Ver resultados» abre una finalizada y «Continuar» una en curso', async () => {
    const onAbrir = vi.fn();
    render(<HistorialTabla filas={[finalizada, enCurso]} onAbrir={onAbrir} />);
    await userEvent.click(screen.getByRole('button', { name: /Ver resultados/ }));
    expect(onAbrir).toHaveBeenLastCalledWith(1);
    await userEvent.click(screen.getByRole('button', { name: /Continuar/ }));
    expect(onAbrir).toHaveBeenLastCalledWith(2);
  });

  it('cada botón se nombra con la evaluación que abre', () => {
    render(<HistorialTabla filas={[enCurso]} onAbrir={() => {}} />);
    expect(
      screen.getByRole('button', { name: 'Continuar «Plataforma de aprendizaje»' }),
    ).toBeInTheDocument();
  });

  it('sin filas muestra el texto vacío en lugar de la tabla', () => {
    render(<HistorialTabla filas={[]} textoVacio="Aún no hay evaluaciones." onAbrir={() => {}} />);
    expect(screen.getByText('Aún no hay evaluaciones.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('«Eliminar» aparece en las filas eliminables, se nombra con la evaluación y emite su id', async () => {
    const onEliminar = vi.fn();
    const onAbrir = vi.fn();
    render(
      <HistorialTabla
        filas={[
          finalizada,
          { ...enCurso, eliminable: true },
          { ...enCurso, id: 3, titulo: '', eliminable: true },
        ]}
        onAbrir={onAbrir}
        onEliminar={onEliminar}
      />,
    );
    const fila = screen.getByRole('row', { name: /Adopción de LibreOffice/ });
    expect(within(fila).queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Eliminar «Plataforma de aprendizaje»' }),
    );
    expect(onEliminar).toHaveBeenLastCalledWith(2);
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar «Evaluación sin título»' }));
    expect(onEliminar).toHaveBeenLastCalledWith(3);
    expect(onAbrir).not.toHaveBeenCalled();
  });

  it('sin onEliminar no ofrece «Eliminar»', () => {
    render(<HistorialTabla filas={[{ ...enCurso, eliminable: true }]} onAbrir={() => {}} />);
    expect(screen.queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
  });

  it('una evaluación sin título se muestra como «Evaluación sin título»', () => {
    render(<HistorialTabla filas={[{ ...enCurso, titulo: '' }]} onAbrir={() => {}} />);
    expect(screen.getByText('Evaluación sin título')).toBeInTheDocument();
  });
});
