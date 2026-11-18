import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from './App';

function renderEn(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App', () => {
  it('muestra la pantalla de inicio en /', () => {
    renderEn('/');
    expect(screen.getByRole('heading', { name: 'GUIOS PRO 2.0' })).toBeInTheDocument();
  });

  it('muestra la página no encontrada en una ruta desconocida', () => {
    renderEn('/no-existe');
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
  });
});
