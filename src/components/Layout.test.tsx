import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Layout } from './Layout';

describe('Layout', () => {
  it('presenta cabecera, navegación, contenido principal y barra inferior', () => {
    render(
      <Layout
        usuario={{ nombre: 'Ana Pérez', iniciales: 'AP', detalle: 'Decisor · UNEMI' }}
        navegacion={<a href="/">Inicio e historial</a>}
        navegacionMovil={<a href="/">Inicio</a>}
        barraInferior={<button type="button">Siguiente</button>}
      >
        <h1>Contenido</h1>
      </Layout>,
    );
    expect(screen.getByRole('banner')).toHaveTextContent('GUIOS PRO');
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { name: 'Contenido' }),
    );
    expect(screen.getByRole('navigation', { name: 'Principal' })).toHaveTextContent(
      'Inicio e historial',
    );
    expect(screen.getByRole('navigation', { name: 'Principal (móvil)' })).toHaveTextContent(
      'Inicio',
    );
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('Decisor · UNEMI')).toBeInTheDocument();
    expect(screen.getByText('AP')).toBeInTheDocument();
  });

  it('ofrece un enlace para saltar al contenido que apunta al main', () => {
    render(<Layout navegacion={null}>x</Layout>);
    const salto = screen.getByRole('link', { name: 'Saltar al contenido' });
    expect(salto).toHaveAttribute('href', '#contenido-principal');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'contenido-principal');
  });

  it('sin usuario, navegación móvil ni barra inferior no renderiza esas zonas', () => {
    render(<Layout navegacion={<a href="/">Inicio</a>}>x</Layout>);
    expect(screen.queryByRole('navigation', { name: 'Principal (móvil)' })).not.toBeInTheDocument();
    expect(screen.queryByText('Decisor · UNEMI')).not.toBeInTheDocument();
  });

  it('muestra acciones de cabecera y subtítulo de marca personalizables', () => {
    render(
      <Layout
        navegacion={null}
        subtituloMarca="Evaluación de adopción de software libre"
        accionesCabecera={<button type="button">Ayuda</button>}
      >
        x
      </Layout>,
    );
    expect(screen.getByText('Evaluación de adopción de software libre')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toContainElement(
      screen.getByRole('button', { name: 'Ayuda' }),
    );
  });
});
