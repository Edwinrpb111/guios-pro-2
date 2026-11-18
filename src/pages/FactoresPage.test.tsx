import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { repositorio } from '../datos';
import type { EvaluacionDetalle, ValoracionFactor } from '../datos/tipos';
import { crearAuthConSesion, renderConAuth } from '../test/auth';
import { evaluacionVaciaPrueba, restablecerRepositorioFalso } from '../test/datos';
import { FactoresPage } from './FactoresPage';

vi.mock('../datos', async () => ({
  repositorio: (await import('../test/datos')).crearRepositorioFalso(),
}));

function Ubicacion() {
  return <p data-testid="ubicacion">{useLocation().pathname}</p>;
}

function renderizar() {
  return renderConAuth(
    <Routes>
      <Route path="/evaluaciones/:id/factores" element={<FactoresPage />} />
      <Route path="*" element={<Ubicacion />} />
    </Routes>,
    { auth: crearAuthConSesion('decisor'), ruta: '/evaluaciones/7/factores' },
  );
}

/** Evaluación con software registrado (el contexto está completo) y las valoraciones dadas. */
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

const todosLosFactores: ValoracionFactor[] = [
  { idFactor: 10, id: 4, alcance: 'Externo', cumplimientos: {} },
  { idFactor: 11, id: 1, alcance: 'Externo', cumplimientos: {} },
  { idFactor: 20, id: 3, alcance: 'Interno', cumplimientos: {} },
  { idFactor: 21, id: 3, alcance: 'Interno', cumplimientos: {} },
];

const importancia = (factor: string, nivel: string) =>
  within(screen.getByRole('radiogroup', { name: `Importancia del factor ${factor}` })).getByRole(
    'radio',
    { name: nivel },
  );
const alcance = (factor: string, valor: string) =>
  within(screen.getByRole('radiogroup', { name: `Alcance del factor ${factor}` })).getByRole(
    'radio',
    { name: valor },
  );
const resumen = () => screen.getByRole('region', { name: 'Resumen de la valoración' });

describe('FactoresPage (P-04)', () => {
  beforeEach(() => {
    restablecerRepositorioFalso(repositorio);
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(evaluacionCon([]));
  });

  it('muestra los factores por dimensión con su IS, subfactores y alcance', async () => {
    renderizar();
    expect(
      await screen.findByRole('heading', { name: 'Dimensión Tecnológica' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dimensión Organizacional' })).toBeInTheDocument();
    expect(screen.getByText('Compatibilidad')).toBeInTheDocument();
    expect(screen.getAllByText('2 subfactores')).toHaveLength(2);
    expect(screen.getAllByText('1 subfactor')).toHaveLength(2);
    expect(screen.getAllByText('Externo', { selector: '.chip' })).toHaveLength(2);
    expect(screen.getByText('Interno', { selector: '.chip' })).toBeInTheDocument();
  });

  it('muestra la IS vigente de cada factor con una ayuda que explica su origen', async () => {
    renderizar();
    await screen.findByText('Compatibilidad');
    const ayuda = screen.getByRole('button', {
      name: 'Ayuda sobre la importancia sugerida de Usabilidad',
    });
    expect(ayuda).toHaveAccessibleDescription(
      'Importancia sugerida = intersección de la importancia del experto (IE = 3) y la de la literatura (IL = 2). Fuente: Cálculo inicial de la tesis.',
    );
    // Usabilidad: IS 2 («Opcional»); Compatibilidad: IS 3 («Importante»).
    expect(screen.getAllByText('Opcional', { selector: '.factor-fila__sugerida b' })).toHaveLength(
      1,
    );
    expect(
      screen.getAllByText('Importante', { selector: '.factor-fila__sugerida b' }),
    ).toHaveLength(3);
  });

  it('usa el cálculo de la evaluación, no necesariamente el vigente', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(evaluacionCon([], { idCalculo: 5 }));
    renderizar();
    await screen.findByText('Compatibilidad');
    expect(repositorio.leerCalculo).toHaveBeenCalledWith(5);
    expect(repositorio.leerCalculoVigente).not.toHaveBeenCalled();
  });

  it('IR y relevancia se calculan al asignar la ID de un clic y se guardan', async () => {
    renderizar();
    await screen.findByText('Compatibilidad');
    expect(within(resumen()).getByText('0/4')).toBeInTheDocument();

    await userEvent.click(importancia('Compatibilidad', 'Fundamental'));

    // IS 3 e ID 4 → IR = floor((3 + 4) / 2) = 3 «Importante», relevante.
    const fila = screen.getByText('Compatibilidad').closest('.factor-fila') as HTMLElement;
    expect(
      within(fila).getByText('Importante', { selector: 'b.factor-fila__ir-valor' }),
    ).toBeInTheDocument();
    expect(within(fila).getByText('● Relevante')).toBeInTheDocument();
    expect(within(resumen()).getByText('1/4')).toBeInTheDocument();
    expect(
      within(resumen()).getByText('1', { selector: '.resumen__relevantes' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(repositorio.guardarValoracionFactor).toHaveBeenCalledWith(7, {
        idFactor: 10,
        id: 4,
        alcance: 'Externo',
        ir: 3,
        relevante: true,
        pm: null,
        foda: null,
      }),
    );
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
  });

  it('un factor con IR 1 se excluye y no cuenta como relevante', async () => {
    renderizar();
    await screen.findByText('Usabilidad');
    await userEvent.click(importancia('Usabilidad', 'Irrelevante'));
    const fila = screen.getByText('Usabilidad').closest('.factor-fila') as HTMLElement;
    expect(within(fila).getByText('○ Se excluye')).toBeInTheDocument();
    expect(within(resumen()).getByText('1/4')).toBeInTheDocument();
    expect(
      within(resumen()).getByText('0', { selector: '.resumen__relevantes' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(repositorio.guardarValoracionFactor).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          idFactor: 11,
          id: 1,
          ir: 1,
          relevante: false,
          pm: null,
          foda: null,
        }),
      ),
    );
  });

  it('IS 3 e ID Irrelevante dan IR 2: sigue siendo relevante (RN-03)', async () => {
    renderizar();
    await screen.findByText('Compatibilidad');
    await userEvent.click(importancia('Compatibilidad', 'Irrelevante'));
    const fila = screen.getByText('Compatibilidad').closest('.factor-fila') as HTMLElement;
    expect(
      within(fila).getByText('Opcional', { selector: 'b.factor-fila__ir-valor' }),
    ).toBeInTheDocument();
    expect(within(fila).getByText('● Relevante')).toBeInTheDocument();
  });

  it('recargar conserva lo valorado: muestra las valoraciones guardadas', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
      evaluacionCon(todosLosFactores.slice(0, 2)),
    );
    renderizar();
    await screen.findByText('Compatibilidad');
    expect(importancia('Compatibilidad', 'Fundamental')).toHaveAttribute('aria-checked', 'true');
    expect(importancia('Usabilidad', 'Irrelevante')).toHaveAttribute('aria-checked', 'true');
    expect(importancia('Soporte', 'Importante')).toHaveAttribute('aria-checked', 'false');
    expect(within(resumen()).getByText('2/4')).toBeInTheDocument();
    expect(repositorio.guardarValoracionFactor).not.toHaveBeenCalled();
  });

  describe('Soporte (alcance Ambos)', () => {
    it('ofrece Interno/Externo con Interno por defecto y solo Soporte lo ofrece', async () => {
      renderizar();
      await screen.findByText('Soporte');
      expect(alcance('Soporte', 'Interno')).toHaveAttribute('aria-checked', 'true');
      expect(alcance('Soporte', 'Externo')).toHaveAttribute('aria-checked', 'false');
      expect(screen.getAllByRole('radiogroup', { name: /Alcance del factor/ })).toHaveLength(1);
    });

    it('el alcance elegido antes de la ID se guarda junto con ella', async () => {
      renderizar();
      await screen.findByText('Soporte');
      await userEvent.click(alcance('Soporte', 'Externo'));
      expect(alcance('Soporte', 'Externo')).toHaveAttribute('aria-checked', 'true');
      expect(repositorio.guardarValoracionFactor).not.toHaveBeenCalled();

      await userEvent.click(importancia('Soporte', 'Importante'));
      await waitFor(() =>
        expect(repositorio.guardarValoracionFactor).toHaveBeenCalledWith(
          7,
          expect.objectContaining({ idFactor: 20, id: 3, alcance: 'Externo', ir: 3 }),
        ),
      );
    });

    it('cambiar el alcance recalcula el FODA con los subfactores ya valorados (RN-07)', async () => {
      vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
        evaluacionCon([
          { idFactor: 20, id: 3, alcance: 'Interno', cumplimientos: { 200: 4, 201: 4 } },
        ]),
      );
      renderizar();
      await screen.findByText('Soporte');
      await userEvent.click(alcance('Soporte', 'Externo'));
      await waitFor(() =>
        expect(repositorio.guardarValoracionFactor).toHaveBeenCalledWith(7, {
          idFactor: 20,
          id: 3,
          alcance: 'Externo',
          ir: 3,
          relevante: true,
          pm: 4,
          foda: 'Oportunidad',
        }),
      );
    });
  });

  it('cambiar la ID recalcula PM y FODA con los subfactores ya valorados', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
      evaluacionCon([{ idFactor: 11, id: 4, alcance: 'Externo', cumplimientos: { 110: 2 } }]),
    );
    renderizar();
    await screen.findByText('Usabilidad');
    // IS 2 e ID 1 → IR 1: deja de ser relevante y se descartan PM y FODA.
    await userEvent.click(importancia('Usabilidad', 'Irrelevante'));
    await waitFor(() =>
      expect(repositorio.guardarValoracionFactor).toHaveBeenCalledWith(7, {
        idFactor: 11,
        id: 1,
        alcance: 'Externo',
        ir: 1,
        relevante: false,
        pm: null,
        foda: null,
      }),
    );
    // De vuelta a Opcional (IR 2) reaparece la PM de su único subfactor (2 → Amenaza).
    await userEvent.click(importancia('Usabilidad', 'Opcional'));
    await waitFor(() =>
      expect(repositorio.guardarValoracionFactor).toHaveBeenLastCalledWith(
        7,
        expect.objectContaining({
          idFactor: 11,
          id: 2,
          ir: 2,
          relevante: true,
          pm: 2,
          foda: 'Amenaza',
        }),
      ),
    );
  });

  it('los cambios seguidos se guardan en el orden en que se hicieron', async () => {
    renderizar();
    await screen.findByText('Compatibilidad');
    await userEvent.click(importancia('Compatibilidad', 'Opcional'));
    await userEvent.click(importancia('Compatibilidad', 'Importante'));
    await userEvent.click(importancia('Formación', 'Fundamental'));
    await waitFor(() => expect(repositorio.guardarValoracionFactor).toHaveBeenCalledTimes(3));
    const enviados = vi
      .mocked(repositorio.guardarValoracionFactor)
      .mock.calls.map(([, fila]) => [fila.idFactor, fila.id]);
    expect(enviados).toEqual([
      [10, 2],
      [10, 3],
      [21, 4],
    ]);
  });

  it('si no se puede guardar avisa y deshace el cambio', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
      evaluacionCon(todosLosFactores.slice(0, 1)),
    );
    vi.mocked(repositorio.guardarValoracionFactor).mockRejectedValue(new Error('sin conexión'));
    renderizar();
    await screen.findByText('Compatibilidad');
    await userEvent.click(importancia('Compatibilidad', 'Opcional'));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar');
    expect(importancia('Compatibilidad', 'Fundamental')).toHaveAttribute('aria-checked', 'true');
    expect(importancia('Compatibilidad', 'Opcional')).toHaveAttribute('aria-checked', 'false');
  });

  it('«Continuar a subfactores» se habilita al valorar todos los factores', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
      evaluacionCon(todosLosFactores.slice(0, 3)),
    );
    renderizar();
    await screen.findByText('Compatibilidad');
    const continuar = screen.getByRole('button', { name: /Continuar a subfactores/ });
    expect(continuar).toBeDisabled();
    await userEvent.click(importancia('Formación', 'Importante'));
    expect(continuar).toBeEnabled();
    await userEvent.click(continuar);
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/evaluaciones/7/subfactores');
    expect(repositorio.guardarValoracionFactor).toHaveBeenCalledTimes(1);
  });

  it('«Atrás» vuelve al contexto', async () => {
    renderizar();
    await screen.findByText('Compatibilidad');
    await userEvent.click(screen.getByRole('button', { name: /Atrás/ }));
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/evaluaciones/7/contexto');
  });

  it('el stepper marca el contexto completo y habilita los subfactores solo con todo asignado', async () => {
    renderizar();
    await screen.findByText('Compatibilidad');
    expect(screen.getByRole('button', { name: /Factores/ })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByRole('button', { name: /Contexto.*completado/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Subfactores/ })).toBeDisabled();
  });

  it('una evaluación finalizada no se puede editar', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
      evaluacionCon(todosLosFactores, { estado: 'finalizada' }),
    );
    renderizar();
    await screen.findByText('Compatibilidad');
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
