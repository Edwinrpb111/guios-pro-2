import { render, screen, within } from '@testing-library/react';
import { RecomendacionCard, type RecomendacionCardProps } from './RecomendacionCard';

const TEXTO_A = 'Todos los factores evaluados son fortalezas u oportunidades.';
const adoptar: RecomendacionCardProps = {
  codigo: 'A',
  titulo: 'Adoptar el software evaluado',
  texto: TEXTO_A,
  causas: [],
};

describe('RecomendacionCard', () => {
  it('muestra la letra, el título y el texto de la recomendación', () => {
    render(<RecomendacionCard {...adoptar} />);
    const tarjeta = screen.getByRole('region', { name: 'Recomendación' });
    expect(within(tarjeta).getByText('A', { selector: '[data-codigo]' })).toBeInTheDocument();
    expect(
      within(tarjeta).getByRole('heading', { name: 'Adoptar el software evaluado' }),
    ).toBeInTheDocument();
    expect(within(tarjeta).getByText(TEXTO_A)).toBeInTheDocument();
  });

  it('sin causas (A) lo dice con texto', () => {
    render(<RecomendacionCard {...adoptar} />);
    expect(screen.getByText(/Ningún factor evaluado es debilidad ni amenaza/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Factores que causan la recomendación' })).toBeNull();
  });

  it('lista las causas con su clasificación FODA y su importancia relativa en texto', () => {
    render(
      <RecomendacionCard
        codigo="C"
        titulo="Analizar la adopción; debería posponerse"
        texto="Hay debilidades o amenazas en factores importantes."
        causas={[
          { nombre: 'Personalización', foda: 'Amenaza', ir: 3 },
          { nombre: 'Soporte', foda: 'Debilidad', ir: 4 },
        ]}
      />,
    );
    const causas = screen.getByRole('list', { name: 'Factores que causan la recomendación' });
    const items = within(causas).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Personalización');
    expect(items[0]).toHaveTextContent('Amenaza');
    expect(items[0]).toHaveTextContent('Importante');
    expect(items[1]).toHaveTextContent('Soporte');
    expect(items[1]).toHaveTextContent('Debilidad');
    expect(items[1]).toHaveTextContent('Fundamental');
    expect(screen.getByText('C', { selector: '[data-codigo]' })).toHaveAttribute(
      'data-codigo',
      'C',
    );
  });

  it('sin código explica por qué no hay recomendación', () => {
    render(<RecomendacionCard codigo={null} />);
    expect(screen.getByRole('heading', { name: 'Sin recomendación' })).toBeInTheDocument();
    expect(screen.getByText(/Ningún factor está evaluado/)).toBeInTheDocument();
    expect(document.querySelector('[data-codigo]')).toBeNull();
  });
});
