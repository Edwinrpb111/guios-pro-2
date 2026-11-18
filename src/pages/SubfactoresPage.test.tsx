import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { repositorio } from '../datos';
import type { EvaluacionDetalle, ValoracionFactor } from '../datos/tipos';
import { crearAuthConSesion, renderConAuth } from '../test/auth';
import { evaluacionVaciaPrueba, restablecerRepositorioFalso } from '../test/datos';
import { SubfactoresPage } from './SubfactoresPage';

vi.mock('../datos', async () => ({
  repositorio: (await import('../test/datos')).crearRepositorioFalso(),
}));

function Ubicacion() {
  return <p data-testid="ubicacion">{useLocation().pathname}</p>;
}

function renderizar(ruta = '/evaluaciones/7/subfactores') {
  return renderConAuth(
    <Routes>
      <Route path="/evaluaciones/:id/subfactores" element={<SubfactoresPage />} />
      <Route path="*" element={<Ubicacion />} />
    </Routes>,
    { auth: crearAuthConSesion('decisor'), ruta },
  );
}

function evaluacionCon(
  valoraciones: ValoracionFactor[],
  parcial: Partial<EvaluacionDetalle> = {},
): EvaluacionDetalle {
  return {
    ...evaluacionVaciaPrueba,
    contexto: {
      ...evaluacionVaciaPrueba.contexto,
      titulo: 'Plataforma de aprendizaje',
      software: { id: 3, nombre: 'Moodle', version: '4.4', licencia: 'GPL v3' },
    },
    valoraciones,
    ...parcial,
  };
}

// IS (calculoPrueba): Compatibilidad 3, Usabilidad 2, Soporte 3, Formación 3.
const valoraciones = (): ValoracionFactor[] => [
  { idFactor: 10, id: 4, alcance: 'Externo', cumplimientos: {} }, // IR 3, relevante
  { idFactor: 11, id: 1, alcance: 'Externo', cumplimientos: {} }, // IR 1, se excluye
  { idFactor: 20, id: 3, alcance: 'Interno', cumplimientos: {} }, // IR 3, relevante
  { idFactor: 21, id: 3, alcance: 'Interno', cumplimientos: {} }, // IR 3, relevante
];

const cumplimiento = (enunciado: string, nivel: string) =>
  within(screen.getByRole('radiogroup', { name: `Cumplimiento: ${enunciado}` })).getByRole(
    'radio',
    { name: nivel },
  );
const lista = () => screen.getByRole('navigation', { name: 'Factores relevantes' });
const panelPm = () => screen.getByRole('region', { name: 'Ponderación del factor' });

const COMPAT_1 = 'Es compatible con los formatos abiertos';
const COMPAT_2 = 'Se integra con los sistemas existentes';
const SOPORTE_1 = 'Existe soporte profesional disponible';
const SOPORTE_2 = 'La comunidad responde con rapidez';

describe('SubfactoresPage (P-05)', () => {
  beforeEach(() => {
    restablecerRepositorioFalso(repositorio);
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(evaluacionCon(valoraciones()));
  });

  it('lista solo los factores relevantes y abre el primero con todos sus subfactores visibles', async () => {
    renderizar();
    expect(await screen.findByRole('heading', { name: 'Compatibilidad' })).toBeInTheDocument();
    const nombres = within(lista())
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(nombres).toEqual([
      expect.stringContaining('Compatibilidad'),
      expect.stringContaining('Soporte'),
      expect.stringContaining('Formación'),
    ]);
    expect(within(lista()).queryByText(/Usabilidad/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2);
    expect(screen.getByText(COMPAT_1)).toBeInTheDocument();
    expect(screen.getByText(COMPAT_2)).toBeInTheDocument();
  });

  it('abre el factor indicado en ?factor= y lo cambia desde la lista', async () => {
    renderizar('/evaluaciones/7/subfactores?factor=20');
    expect(await screen.findByRole('heading', { name: 'Soporte' })).toBeInTheDocument();
    expect(screen.getByText(SOPORTE_1)).toBeInTheDocument();
    await userEvent.click(within(lista()).getByRole('button', { name: /Formación/ }));
    expect(await screen.findByRole('heading', { name: 'Formación' })).toBeInTheDocument();
    expect(screen.getByText('El personal recibe formación suficiente')).toBeInTheDocument();
  });

  it('un ?factor= de un factor no relevante o inexistente abre el primero relevante', async () => {
    renderizar('/evaluaciones/7/subfactores?factor=11');
    expect(await screen.findByRole('heading', { name: 'Compatibilidad' })).toBeInTheDocument();
  });

  it('un clic valora el subfactor y la PM se actualiza en vivo; incompleto queda parcial sin FODA', async () => {
    renderizar();
    await screen.findByText(COMPAT_1);
    expect(within(panelPm()).getByText('Pendiente: faltan 2 subfactores')).toBeInTheDocument();

    await userEvent.click(cumplimiento(COMPAT_1, 'Cumple el requisito'));

    expect(within(panelPm()).getByText('4,00')).toBeInTheDocument();
    expect(within(panelPm()).getByText('Ponderación media (parcial)')).toBeInTheDocument();
    expect(within(panelPm()).getByText('Pendiente: falta 1 subfactor')).toBeInTheDocument();
    expect(within(panelPm()).queryByText('Oportunidad')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(repositorio.guardarValoracionSubfactor).toHaveBeenCalledWith(
        7,
        { idFactor: 10, id: 4, alcance: 'Externo', ir: 3, relevante: true, pm: null, foda: null },
        100,
        4,
      ),
    );
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
  });

  it('PM = 3,00 exacto en un factor externo es Oportunidad (BRIEF §6.4) y se guarda con ese FODA', async () => {
    renderizar();
    await screen.findByText(COMPAT_1);
    await userEvent.click(cumplimiento(COMPAT_1, 'Cumple el requisito'));
    await userEvent.click(cumplimiento(COMPAT_2, 'Desconozco si cumple'));
    // (4 + 2) / 2 = 3: en el umbral, no por debajo.
    expect(within(panelPm()).getByText('3,00')).toBeInTheDocument();
    expect(within(panelPm()).getAllByText('Oportunidad').length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(repositorio.guardarValoracionSubfactor).toHaveBeenLastCalledWith(
        7,
        {
          idFactor: 10,
          id: 4,
          alcance: 'Externo',
          ir: 3,
          relevante: true,
          pm: 3,
          foda: 'Oportunidad',
        },
        101,
        2,
      ),
    );
  });

  it('un factor interno con PM bajo el umbral es Debilidad', async () => {
    renderizar('/evaluaciones/7/subfactores?factor=20');
    await screen.findByRole('heading', { name: 'Soporte' });
    await userEvent.click(cumplimiento(SOPORTE_1, 'Cumple parcialmente'));
    await userEvent.click(cumplimiento(SOPORTE_2, 'No cumple el requisito'));
    // (3 + 1) / 2 = 2 < 3.
    expect(within(panelPm()).getByText('2,00')).toBeInTheDocument();
    expect(within(panelPm()).getAllByText('Debilidad').length).toBeGreaterThan(0);
  });

  it('muestra el avance de cada factor y su clasificación en la lista', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
      evaluacionCon([
        { idFactor: 10, id: 4, alcance: 'Externo', cumplimientos: { 100: 4 } },
        { idFactor: 20, id: 3, alcance: 'Interno', cumplimientos: { 200: 1, 201: 2 } },
        { idFactor: 21, id: 3, alcance: 'Interno', cumplimientos: {} },
      ]),
    );
    renderizar();
    await screen.findByText(COMPAT_1);
    const compat = within(lista()).getByRole('button', { name: /Compatibilidad/ });
    expect(compat).toHaveTextContent('1/2');
    expect(compat).toHaveTextContent('Pendiente');
    const soporte = within(lista()).getByRole('button', { name: /Soporte/ });
    expect(soporte).toHaveTextContent('2/2');
    expect(soporte).toHaveTextContent('Debilidad');
    expect(within(lista()).getByRole('button', { name: /Formación/ })).toHaveTextContent('0/1');
    expect(compat).toHaveAttribute('aria-current', 'true');
  });

  it('recargar conserva lo valorado', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
      evaluacionCon([
        { idFactor: 10, id: 4, alcance: 'Externo', cumplimientos: { 100: 3 } },
        ...valoraciones().slice(1),
      ]),
    );
    renderizar();
    await screen.findByText(COMPAT_1);
    expect(cumplimiento(COMPAT_1, 'Cumple parcialmente')).toHaveAttribute('aria-checked', 'true');
    expect(cumplimiento(COMPAT_2, 'Cumple parcialmente')).toHaveAttribute('aria-checked', 'false');
    expect(repositorio.guardarValoracionSubfactor).not.toHaveBeenCalled();
  });

  it('los clics seguidos se guardan en el orden en que se hicieron', async () => {
    renderizar();
    await screen.findByText(COMPAT_1);
    await userEvent.click(cumplimiento(COMPAT_1, 'No cumple el requisito'));
    await userEvent.click(cumplimiento(COMPAT_1, 'Cumple el requisito'));
    await userEvent.click(cumplimiento(COMPAT_2, 'Cumple parcialmente'));
    await waitFor(() => expect(repositorio.guardarValoracionSubfactor).toHaveBeenCalledTimes(3));
    expect(
      vi
        .mocked(repositorio.guardarValoracionSubfactor)
        .mock.calls.map(([, , subfactor, ps]) => [subfactor, ps]),
    ).toEqual([
      [100, 1],
      [100, 4],
      [101, 3],
    ]);
  });

  it('si no se puede guardar avisa y deshace el cambio', async () => {
    vi.mocked(repositorio.guardarValoracionSubfactor).mockRejectedValue(new Error('sin conexión'));
    renderizar();
    await screen.findByText(COMPAT_1);
    await userEvent.click(cumplimiento(COMPAT_1, 'Cumple el requisito'));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar');
    expect(cumplimiento(COMPAT_1, 'Cumple el requisito')).toHaveAttribute('aria-checked', 'false');
    expect(within(panelPm()).getByText('Pendiente: faltan 2 subfactores')).toBeInTheDocument();
  });

  it('«Ver resultados» lleva a los resultados aun con factores pendientes, tras esperar el guardado', async () => {
    renderizar();
    await screen.findByText(COMPAT_1);
    await userEvent.click(cumplimiento(COMPAT_1, 'Cumple el requisito'));
    await userEvent.click(screen.getByRole('button', { name: /Ver resultados/ }));
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/evaluaciones/7/resultados');
    expect(repositorio.guardarValoracionSubfactor).toHaveBeenCalledTimes(1);
  });

  it('«Atrás» vuelve a los factores', async () => {
    renderizar();
    await screen.findByText(COMPAT_1);
    await userEvent.click(screen.getByRole('button', { name: /Atrás/ }));
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/evaluaciones/7/factores');
  });

  it('sin factores relevantes lo explica y no ofrece subfactores', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
      evaluacionCon([{ idFactor: 11, id: 1, alcance: 'Externo', cumplimientos: {} }]),
    );
    renderizar();
    expect(await screen.findByText(/Ningún factor es relevante/)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('una evaluación finalizada no se puede editar', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
      evaluacionCon(valoraciones(), { estado: 'finalizada' }),
    );
    renderizar();
    await screen.findByText(COMPAT_1);
    expect(screen.getByText(/está finalizada y no se puede editar/)).toBeInTheDocument();
    for (const opcion of screen.getAllByRole('radio')) expect(opcion).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Guardar borrador' })).not.toBeInTheDocument();
  });

  it('una evaluación inexistente lo dice', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(null);
    renderizar();
    expect(await screen.findByText('No se encontró la evaluación.')).toBeInTheDocument();
  });
});
