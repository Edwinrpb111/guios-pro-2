import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { repositorio } from '../datos';
import { useHistorial } from '../evaluacion/consultas';
import { crearAuthConSesion, renderConAuth } from '../test/auth';
import { resumenPrueba, restablecerRepositorioFalso } from '../test/datos';
import { MarcoDecisor } from './MarcoDecisor';

vi.mock('../datos', async () => ({
  repositorio: (await import('../test/datos')).crearRepositorioFalso(),
}));

function Ubicacion() {
  return <p data-testid="ubicacion">{useLocation().pathname}</p>;
}

/** Contenido de prueba que usa el historial, para ver si «Nueva evaluación» lo invalida. */
function ConHistorial() {
  const historial = useHistorial();
  return <p data-testid="historial">{historial.data?.length ?? '…'} evaluaciones</p>;
}

function renderizar(rol: 'decisor' | 'administrador' = 'decisor') {
  return renderConAuth(
    <Routes>
      <Route
        path="/"
        element={
          <MarcoDecisor>
            <ConHistorial />
          </MarcoDecisor>
        }
      />
      <Route path="*" element={<Ubicacion />} />
    </Routes>,
    { auth: crearAuthConSesion(rol) },
  );
}

const lateral = () => within(screen.getByRole('navigation', { name: 'Principal' }));
const movil = () => within(screen.getByRole('navigation', { name: 'Principal (móvil)' }));

describe('MarcoDecisor', () => {
  beforeEach(() => {
    restablecerRepositorioFalso(repositorio);
  });

  it('un decisor no ve la navegación de administración', async () => {
    renderizar('decisor');
    await screen.findByText('0 evaluaciones');
    expect(lateral().queryByRole('link', { name: /Importancia sugerida/ })).toBeNull();
    expect(movil().queryByRole('link', { name: /IA/ })).toBeNull();
    expect(lateral().queryByRole('link', { name: /Configuración del recálculo/ })).toBeNull();
    expect(movil().queryByRole('link', { name: /Ajustes/ })).toBeNull();
    expect(screen.getByText('Decisor', { selector: '.layout__quien span' })).toBeInTheDocument();
  });

  it('un administrador ve el acceso a la importancia sugerida', async () => {
    renderizar('administrador');
    await screen.findByText('0 evaluaciones');
    expect(lateral().getByRole('link', { name: /Importancia sugerida/ })).toHaveAttribute(
      'href',
      '/admin/sugerida',
    );
    expect(movil().getByRole('link', { name: /IA/ })).toHaveAttribute('href', '/admin/sugerida');
    expect(lateral().getByRole('link', { name: /Configuración del recálculo/ })).toHaveAttribute(
      'href',
      '/admin/configuracion',
    );
    expect(movil().getByRole('link', { name: /Ajustes/ })).toHaveAttribute(
      'href',
      '/admin/configuracion',
    );
    expect(screen.getByText('Administrador', { selector: '.layout__quien span' })).toBeVisible();
  });

  it('la cabecera ofrece la ayuda del método (P-11) a cualquier rol', async () => {
    for (const rol of ['decisor', 'administrador'] as const) {
      const { unmount } = renderizar(rol);
      await screen.findByText('0 evaluaciones');
      await userEvent.click(
        within(screen.getByRole('banner')).getByRole('button', { name: 'Ayuda del método' }),
      );
      expect(screen.getByRole('dialog', { name: 'Ayuda del método GUIOS' })).toBeVisible();
      unmount();
    }
  });

  it('«Nueva evaluación» crea el borrador, invalida el historial y abre su contexto', async () => {
    vi.mocked(repositorio.listarEvaluaciones)
      .mockResolvedValueOnce([])
      .mockResolvedValue([resumenPrueba({ id: 7 })]);
    renderizar();
    await screen.findByText('0 evaluaciones');

    await userEvent.click(lateral().getByRole('button', { name: /Nueva evaluación/ }));

    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/evaluaciones/7/contexto');
    expect(repositorio.crearBorrador).toHaveBeenCalledTimes(1);
    // El historial se volvió a leer antes de navegar (la consulta estaba activa).
    expect(repositorio.listarEvaluaciones).toHaveBeenCalledTimes(2);
  });

  it('deshabilita los botones de crear mientras se crea la evaluación', async () => {
    let resolver: (id: number) => void = () => undefined;
    vi.mocked(repositorio.crearBorrador).mockReturnValue(
      new Promise<number>((r) => {
        resolver = r;
      }),
    );
    renderizar();
    await screen.findByText('0 evaluaciones');

    await userEvent.click(movil().getByRole('button', { name: /Evaluar/ }));

    await waitFor(() =>
      expect(lateral().getByRole('button', { name: /Nueva evaluación/ })).toBeDisabled(),
    );
    expect(movil().getByRole('button', { name: /Evaluar/ })).toBeDisabled();
    resolver(7);
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/evaluaciones/7/contexto');
  });

  it('si no se puede crear, lo anuncia con role="alert" y no navega', async () => {
    vi.mocked(repositorio.crearBorrador).mockRejectedValue(
      new Error('No hay una importancia sugerida vigente: no se puede iniciar la evaluación.'),
    );
    renderizar();
    await screen.findByText('0 evaluaciones');

    await userEvent.click(lateral().getByRole('button', { name: /Nueva evaluación/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo crear la evaluación: No hay una importancia sugerida vigente',
    );
    expect(screen.queryByTestId('ubicacion')).toBeNull();
    expect(lateral().getByRole('button', { name: /Nueva evaluación/ })).toBeEnabled();
  });
});
