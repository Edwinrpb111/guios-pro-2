import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { repositorio } from '../datos';
import { crearAuthConSesion, renderConAuth } from '../test/auth';
import { resumenPrueba, restablecerRepositorioFalso } from '../test/datos';
import { InicioPage } from './InicioPage';

vi.mock('../datos', async () => ({
  repositorio: (await import('../test/datos')).crearRepositorioFalso(),
}));

function Ubicacion() {
  return <p data-testid="ubicacion">{useLocation().pathname}</p>;
}

function renderizar(rol: 'decisor' | 'administrador' = 'decisor') {
  return renderConAuth(
    <Routes>
      <Route path="/" element={<InicioPage />} />
      <Route path="*" element={<Ubicacion />} />
    </Routes>,
    { auth: crearAuthConSesion(rol) },
  );
}

const principal = () => within(screen.getByRole('main'));

const evaluaciones = [
  resumenPrueba({
    id: 1,
    titulo: 'Adopción de LibreOffice',
    estado: 'finalizada',
    codigo: 'C',
    software: { nombre: 'LibreOffice', version: '7.x', licencia: 'MPL 2.0' },
    fecha: '2026-10-03T15:00:00Z',
    factoresValorados: [10, 11, 20, 21].map((idFactor) => ({
      idFactor,
      relevante: true,
      subfactoresValorados: 1,
    })),
  }),
  resumenPrueba({
    id: 2,
    titulo: 'Plataforma de aprendizaje',
    fecha: '2026-10-08T15:00:00Z',
    // 4 de 4 factores (40 %) y 3 de 5 subfactores de los relevantes (36 %) → 76 %.
    factoresValorados: [
      { idFactor: 10, relevante: true, subfactoresValorados: 2 },
      { idFactor: 11, relevante: true, subfactoresValorados: 1 },
      { idFactor: 20, relevante: true, subfactoresValorados: 0 },
      { idFactor: 21, relevante: false, subfactoresValorados: 0 },
    ],
  }),
  resumenPrueba({
    id: 3,
    titulo: 'ERP administrativo',
    software: null,
    organizacion: null,
  }),
];

describe('InicioPage (P-02)', () => {
  beforeEach(() => {
    restablecerRepositorioFalso(repositorio);
    vi.mocked(repositorio.listarEvaluaciones).mockResolvedValue(evaluaciones);
  });

  it('saluda con el primer nombre y muestra la importancia sugerida vigente', async () => {
    renderizar();
    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument();
    expect(await principal().findByText('Cálculo inicial de la tesis')).toBeInTheDocument();
    expect(principal().getByText('RSL de la tesis · 2022')).toBeInTheDocument();
  });

  it('cuenta las evaluaciones, las finalizadas y las que están en curso', async () => {
    renderizar();
    const kpi = (titulo: string) =>
      screen.getByText(titulo, { selector: '.kpi__titulo' }).parentElement;
    await screen.findByRole('table');
    expect(kpi('Evaluaciones')).toHaveTextContent('3');
    expect(kpi('Finalizadas')).toHaveTextContent('1');
    expect(kpi('En curso')).toHaveTextContent('2');
  });

  it('lista el historial con estado, avance y recomendación', async () => {
    renderizar();
    const tabla = await screen.findByRole('table');
    const libre = within(tabla).getByRole('row', { name: /Adopción de LibreOffice/ });
    expect(within(libre).getByText('LibreOffice 7.x · MPL 2.0')).toBeInTheDocument();
    expect(within(libre).getByText('Finalizada')).toBeInTheDocument();
    expect(within(libre).getByText('03/10/2026')).toBeInTheDocument();
    expect(within(libre).getByLabelText('Recomendación C')).toBeInTheDocument();
    const plataforma = within(tabla).getByRole('row', { name: /Plataforma de aprendizaje/ });
    expect(within(plataforma).getByText('En curso · 76 %')).toBeInTheDocument();
    expect(within(plataforma).getByText('Universidad Estatal de Milagro')).toBeInTheDocument();
  });

  it('filtra por estado y por texto', async () => {
    renderizar();
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'finalizada');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Adopción de LibreOffice')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'todas');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'moodle');
    expect(screen.getByText('Plataforma de aprendizaje')).toBeInTheDocument();
    expect(screen.queryByText('Adopción de LibreOffice')).not.toBeInTheDocument();
  });

  it('avisa cuando el filtro no encuentra nada', async () => {
    renderizar();
    await screen.findByRole('table');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar' }), 'zzz');
    expect(screen.getByText('Ninguna evaluación coincide con el filtro.')).toBeInTheDocument();
  });

  it('«Ver resultados» abre los resultados de una finalizada', async () => {
    renderizar();
    await screen.findByRole('table');
    await userEvent.click(
      screen.getByRole('button', { name: 'Ver resultados «Adopción de LibreOffice»' }),
    );
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/evaluaciones/1/resultados');
  });

  it('una evaluación en curso sin software retoma en el contexto', async () => {
    renderizar();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar «ERP administrativo»' }));
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/evaluaciones/3/contexto');
  });

  it('una evaluación con todos los factores asignados retoma en los subfactores', async () => {
    renderizar();
    await screen.findByRole('table');
    await userEvent.click(
      screen.getByRole('button', { name: 'Continuar «Plataforma de aprendizaje»' }),
    );
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/evaluaciones/2/subfactores');
  });

  it('«Nueva evaluación» crea un borrador y abre su contexto', async () => {
    vi.mocked(repositorio.crearBorrador).mockResolvedValue(42);
    renderizar();
    await screen.findByRole('table');
    await userEvent.click(principal().getByRole('button', { name: 'Nueva evaluación' }));
    expect(repositorio.crearBorrador).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/evaluaciones/42/contexto');
  });

  it('si no se puede crear el borrador lo dice y no navega', async () => {
    vi.mocked(repositorio.crearBorrador).mockRejectedValue(
      new Error('No hay una importancia sugerida vigente'),
    );
    renderizar();
    await screen.findByRole('table');
    await userEvent.click(principal().getByRole('button', { name: 'Nueva evaluación' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No hay una importancia sugerida vigente',
    );
    expect(screen.queryByTestId('ubicacion')).not.toBeInTheDocument();
  });

  it('sin evaluaciones invita a crear la primera', async () => {
    vi.mocked(repositorio.listarEvaluaciones).mockResolvedValue([]);
    renderizar();
    expect(
      await screen.findByText('Aún no tienes evaluaciones. Crea la primera.'),
    ).toBeInTheDocument();
  });

  it('si falla la carga muestra el error y permite reintentar', async () => {
    vi.mocked(repositorio.listarEvaluaciones).mockRejectedValueOnce(new Error('sin red'));
    renderizar();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el historial');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('cerrar sesión llama a cerrarSesion', async () => {
    const { auth } = renderizar();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(auth.cerrarSesion).toHaveBeenCalledTimes(1);
  });

  it('solo el administrador ve el enlace a la importancia sugerida', async () => {
    const { unmount } = renderizar('decisor');
    await screen.findByRole('table');
    expect(screen.queryByRole('link', { name: 'Importancia sugerida' })).not.toBeInTheDocument();
    unmount();
    renderizar('administrador');
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Importancia sugerida' })).toHaveAttribute(
        'href',
        '/admin/sugerida',
      ),
    );
  });
});
