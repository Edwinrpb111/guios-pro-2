import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { repositorio } from '../datos';
import type { EvaluacionDetalle, ValoracionFactor } from '../datos/tipos';
import { TEXTOS_RECOMENDACION } from '../guios-core';
import { crearAuthConSesion, renderConAuth } from '../test/auth';
import { evaluacionVaciaPrueba, restablecerRepositorioFalso } from '../test/datos';
import { ResultadosPage } from './ResultadosPage';

vi.mock('../datos', async () => ({
  repositorio: (await import('../test/datos')).crearRepositorioFalso(),
}));

function Ubicacion() {
  const { pathname, search } = useLocation();
  return <p data-testid="ubicacion">{pathname + search}</p>;
}

function renderizar() {
  return renderConAuth(
    <Routes>
      <Route path="/evaluaciones/:id/resultados" element={<ResultadosPage />} />
      <Route path="*" element={<Ubicacion />} />
    </Routes>,
    { auth: crearAuthConSesion('decisor'), ruta: '/evaluaciones/7/resultados' },
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
const compatibilidad = (ps: Record<number, 1 | 2 | 3 | 4>): ValoracionFactor => ({
  idFactor: 10,
  id: 4,
  alcance: 'Externo',
  cumplimientos: ps,
});
const usabilidad = (ps: Record<number, 1 | 2 | 3 | 4>): ValoracionFactor => ({
  idFactor: 11,
  id: 2,
  alcance: 'Externo',
  cumplimientos: ps,
});
const soporte = (ps: Record<number, 1 | 2 | 3 | 4>): ValoracionFactor => ({
  idFactor: 20,
  id: 3,
  alcance: 'Interno',
  cumplimientos: ps,
});
const formacion = (ps: Record<number, 1 | 2 | 3 | 4>): ValoracionFactor => ({
  idFactor: 21,
  id: 3,
  alcance: 'Interno',
  cumplimientos: ps,
});

const cuadrante = (nombre: string) =>
  within(screen.getByRole('group', { name: 'Matriz FODA' })).getByRole('region', {
    name: new RegExp(`^${nombre}`),
  });
const recomendacion = () => screen.getByRole('region', { name: 'Recomendación' });

describe('ResultadosPage (P-06)', () => {
  beforeEach(() => {
    restablecerRepositorioFalso(repositorio);
  });

  describe('casos borde de la recomendación (BRIEF §6.4)', () => {
    it('ningún factor evaluado: sin recomendación y no se puede finalizar', async () => {
      vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
        evaluacionCon([compatibilidad({ 100: 4 })]),
      );
      renderizar();
      expect(await screen.findByRole('heading', { name: 'Sin recomendación' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Finalizar/ })).toBeDisabled();
    });

    it('todos los evaluados son F u O: recomendación A sin causas', async () => {
      vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
        evaluacionCon([compatibilidad({ 100: 4, 101: 4 }), formacion({ 210: 4 })]),
      );
      renderizar();
      const tarjeta = await screen.findByRole('region', { name: 'Recomendación' });
      expect(within(tarjeta).getByText('A', { selector: '[data-codigo]' })).toBeInTheDocument();
      expect(
        within(tarjeta).getByRole('heading', { name: 'Adoptar el software evaluado' }),
      ).toBeInTheDocument();
      expect(within(tarjeta).getByText(TEXTOS_RECOMENDACION.A.texto)).toBeInTheDocument();
    });

    it('una única Amenaza con IR 2 y el resto F u O: B', async () => {
      vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
        evaluacionCon([compatibilidad({ 100: 4, 101: 4 }), usabilidad({ 110: 2 })]),
      );
      renderizar();
      await screen.findByRole('region', { name: 'Recomendación' });
      expect(within(recomendacion()).getByText('B', { selector: '[data-codigo]' })).toBeVisible();
      const causas = within(recomendacion()).getByRole('list', {
        name: 'Factores que causan la recomendación',
      });
      expect(causas).toHaveTextContent('Usabilidad');
      expect(causas).toHaveTextContent('Amenaza');
      expect(causas).toHaveTextContent('Opcional');
    });

    it('una Amenaza con IR 2 y una Debilidad con IR 3: C, causada solo por la de IR ≥ 3', async () => {
      vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
        evaluacionCon([usabilidad({ 110: 2 }), soporte({ 200: 1, 201: 2 })]),
      );
      renderizar();
      await screen.findByRole('region', { name: 'Recomendación' });
      expect(within(recomendacion()).getByText('C', { selector: '[data-codigo]' })).toBeVisible();
      const causas = within(recomendacion()).getByRole('list', {
        name: 'Factores que causan la recomendación',
      });
      expect(within(causas).getAllByRole('listitem')).toHaveLength(1);
      expect(causas).toHaveTextContent('Soporte');
      expect(causas).toHaveTextContent('Debilidad');
      expect(causas).toHaveTextContent('Importante');
    });

    it('un factor relevante con un subfactor sin valorar se excluye y los demás deciden', async () => {
      vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
        evaluacionCon([compatibilidad({ 100: 4, 101: 4 }), soporte({ 200: 1 })]),
      );
      renderizar();
      await screen.findByRole('region', { name: 'Recomendación' });
      // Soporte tendría una Debilidad con IR 3 (C) si contara; al estar incompleto, decide Compatibilidad: A.
      expect(within(recomendacion()).getByText('A', { selector: '[data-codigo]' })).toBeVisible();
      const pendientes = screen.getByRole('region', { name: 'Factores pendientes' });
      expect(pendientes).toHaveTextContent('Soporte');
      expect(pendientes).toHaveTextContent('falta 1 subfactor');
      expect(pendientes).toHaveTextContent('no cuentan para la recomendación');
      expect(within(cuadrante('Debilidades')).queryByText('Soporte')).not.toBeInTheDocument();
    });

    it('PM = 3,00 exacto en un factor externo se muestra como Oportunidad', async () => {
      vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
        evaluacionCon([compatibilidad({ 100: 4, 101: 2 })]),
      );
      renderizar();
      await screen.findByRole('region', { name: 'Recomendación' });
      const oportunidades = cuadrante('Oportunidades');
      expect(within(oportunidades).getByText('Compatibilidad')).toBeInTheDocument();
      expect(within(oportunidades).getByText('3,00')).toBeInTheDocument();
      expect(within(cuadrante('Amenazas')).queryByText('Compatibilidad')).not.toBeInTheDocument();
    });
  });

  it('muestra la matriz FODA con cada factor evaluado y su PM en su cuadrante', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
      evaluacionCon([
        compatibilidad({ 100: 4, 101: 4 }),
        usabilidad({ 110: 2 }),
        soporte({ 200: 1, 201: 2 }),
        formacion({ 210: 3 }),
      ]),
    );
    renderizar();
    await screen.findByRole('region', { name: 'Recomendación' });
    expect(within(cuadrante('Oportunidades')).getByText('Compatibilidad')).toBeInTheDocument();
    expect(within(cuadrante('Amenazas')).getByText('Usabilidad')).toBeInTheDocument();
    expect(within(cuadrante('Debilidades')).getByText('Soporte')).toBeInTheDocument();
    expect(within(cuadrante('Debilidades')).getByText('1,50')).toBeInTheDocument();
    expect(within(cuadrante('Fortalezas')).getByText('Formación')).toBeInTheDocument();
  });

  it('desde la matriz se va a los subfactores del factor', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
      evaluacionCon([soporte({ 200: 1, 201: 2 })]),
    );
    renderizar();
    await screen.findByRole('region', { name: 'Recomendación' });
    await userEvent.click(
      within(cuadrante('Debilidades')).getByRole('button', { name: /Soporte/ }),
    );
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent(
      '/evaluaciones/7/subfactores?factor=20',
    );
  });

  it('un factor pendiente lleva a completar sus subfactores', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(
      evaluacionCon([soporte({ 200: 1 }), compatibilidad({ 100: 4, 101: 4 })]),
    );
    renderizar();
    await screen.findByRole('region', { name: 'Recomendación' });
    await userEvent.click(screen.getByRole('button', { name: 'Completar Soporte' }));
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent(
      '/evaluaciones/7/subfactores?factor=20',
    );
  });

  describe('Finalizar', () => {
    const enCurso = () =>
      evaluacionCon([
        compatibilidad({ 100: 4, 101: 4 }),
        usabilidad({}),
        soporte({ 200: 1, 201: 2 }),
        formacion({ 210: 3 }),
      ]);

    it('pide confirmación y no guarda si se cancela', async () => {
      vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(enCurso());
      renderizar();
      await screen.findByRole('region', { name: 'Recomendación' });
      await userEvent.click(screen.getByRole('button', { name: /Finalizar/ }));
      expect(screen.getByRole('alertdialog')).toHaveTextContent('ya no se podrá editar');
      expect(screen.getByRole('alertdialog')).toHaveTextContent('1 factor pendiente');
      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(repositorio.finalizarEvaluacion).not.toHaveBeenCalled();
    });

    it('al confirmar guarda la fotografía de los factores y la recomendación con sus causas, y congela', async () => {
      vi.mocked(repositorio.leerEvaluacion)
        .mockResolvedValueOnce(enCurso())
        .mockResolvedValue(
          evaluacionCon([...enCurso().valoraciones], {
            estado: 'finalizada',
            recomendacion: {
              codigo: 'C',
              texto: TEXTOS_RECOMENDACION.C.texto,
              causas: [{ nombre: 'Soporte', foda: 'Debilidad', ir: 3 }],
            },
          }),
        );
      renderizar();
      await screen.findByRole('region', { name: 'Recomendación' });
      await userEvent.click(screen.getByRole('button', { name: /Finalizar/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar y finalizar' }));

      await waitFor(() => expect(repositorio.finalizarEvaluacion).toHaveBeenCalledTimes(1));
      const [idEvaluacion, finalizacion] = vi.mocked(repositorio.finalizarEvaluacion).mock
        .calls[0] ?? [0, null];
      expect(idEvaluacion).toBe(7);
      expect(finalizacion?.recomendacion).toEqual({
        codigo: 'C',
        texto: TEXTOS_RECOMENDACION.C.texto,
        causas: [{ nombre: 'Soporte', foda: 'Debilidad', ir: 3 }],
      });
      expect(finalizacion?.factores.map((f) => [f.idFactor, f.pm, f.foda])).toEqual([
        [10, 4, 'Oportunidad'],
        [11, null, null],
        [20, 1.5, 'Debilidad'],
        [21, 3, 'Fortaleza'],
      ]);
      expect(
        await screen.findByText(/Esta evaluación está finalizada y no se puede editar/),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Finalizar/ })).not.toBeInTheDocument();
    });

    it('si no se puede finalizar avisa y la evaluación sigue en curso', async () => {
      vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(enCurso());
      vi.mocked(repositorio.finalizarEvaluacion).mockRejectedValue(new Error('sin conexión'));
      renderizar();
      await screen.findByRole('region', { name: 'Recomendación' });
      await userEvent.click(screen.getByRole('button', { name: /Finalizar/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Confirmar y finalizar' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo finalizar');
      expect(screen.getByRole('button', { name: /Finalizar/ })).toBeEnabled();
    });
  });

  describe('evaluación finalizada', () => {
    const finalizada = () =>
      evaluacionCon([compatibilidad({ 100: 4, 101: 4 }), soporte({ 200: 1, 201: 2 })], {
        estado: 'finalizada',
        // Fotografía guardada al finalizar: manda sobre lo que se derivaría hoy.
        recomendacion: {
          codigo: 'C',
          texto: 'Texto guardado al finalizar',
          causas: [{ nombre: 'Soporte', foda: 'Debilidad', ir: 3 }],
        },
      });

    it('muestra la recomendación guardada y no se puede editar ni volver a finalizar', async () => {
      vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(finalizada());
      renderizar();
      await screen.findByRole('region', { name: 'Recomendación' });
      expect(screen.getByText(/está finalizada y no se puede editar/)).toBeInTheDocument();
      expect(within(recomendacion()).getByText('Texto guardado al finalizar')).toBeVisible();
      expect(screen.queryByRole('button', { name: /Finalizar/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Completar/ })).not.toBeInTheDocument();
    });

    it('ofrece el informe imprimible', async () => {
      vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(finalizada());
      renderizar();
      await screen.findByRole('region', { name: 'Recomendación' });
      await userEvent.click(screen.getByRole('button', { name: /Ver informe/ }));
      expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/evaluaciones/7/informe');
    });
  });

  it('«Atrás» vuelve a los subfactores', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(evaluacionCon([]));
    renderizar();
    await screen.findByRole('heading', { name: 'Sin recomendación' });
    await userEvent.click(screen.getByRole('button', { name: /Atrás/ }));
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/evaluaciones/7/subfactores');
  });

  it('una evaluación inexistente lo dice', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(null);
    renderizar();
    expect(await screen.findByText('No se encontró la evaluación.')).toBeInTheDocument();
  });
});
