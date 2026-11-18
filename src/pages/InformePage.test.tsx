import { readFileSync } from 'node:fs';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import { repositorio } from '../datos';
import type { EvaluacionDetalle, ValoracionFactor } from '../datos/tipos';
import { crearAuthConSesion, renderConAuth } from '../test/auth';
import { evaluacionVaciaPrueba, restablecerRepositorioFalso } from '../test/datos';
import { InformePage } from './InformePage';

vi.mock('../datos', async () => ({
  repositorio: (await import('../test/datos')).crearRepositorioFalso(),
}));

function Ubicacion() {
  return <p data-testid="ubicacion">{useLocation().pathname}</p>;
}

function renderizar() {
  return renderConAuth(
    <Routes>
      <Route path="/evaluaciones/:id/informe" element={<InformePage />} />
      <Route path="*" element={<Ubicacion />} />
    </Routes>,
    { auth: crearAuthConSesion('decisor'), ruta: '/evaluaciones/7/informe' },
  );
}

// IS (calculoPrueba): Compatibilidad 3, Usabilidad 2, Soporte 3, Formación 3.
const valoraciones: ValoracionFactor[] = [
  { idFactor: 10, id: 4, alcance: 'Externo', cumplimientos: { 100: 4, 101: 4 } }, // Oportunidad
  { idFactor: 11, id: 1, alcance: 'Externo', cumplimientos: {} }, // IR 1: se excluye
  { idFactor: 20, id: 3, alcance: 'Interno', cumplimientos: { 200: 1, 201: 2 } }, // Debilidad, IR 3
  { idFactor: 21, id: 3, alcance: 'Interno', cumplimientos: {} }, // pendiente
];

function evaluacion(parcial: Partial<EvaluacionDetalle> = {}): EvaluacionDetalle {
  return {
    ...evaluacionVaciaPrueba,
    fecha: '2026-10-08T15:00:00Z',
    contexto: {
      titulo: 'Plataforma de aprendizaje',
      software: { id: 3, nombre: 'Moodle', version: '4.4', licencia: 'GPL v3' },
      organizacion: {
        id: 2,
        nombre: 'Universidad Estatal de Milagro',
        sector: 'Educación',
        pais: 'Ecuador',
      },
    },
    valoraciones,
    ...parcial,
  };
}

const finalizada = (): EvaluacionDetalle =>
  evaluacion({
    estado: 'finalizada',
    recomendacion: {
      codigo: 'C',
      texto: 'Texto guardado al finalizar',
      causas: [{ nombre: 'Soporte', foda: 'Debilidad', ir: 3 }],
    },
  });

const fila = (factor: string) => {
  const celda = within(screen.getByRole('table', { name: 'Resultados por factor' })).getByRole(
    'rowheader',
    { name: factor },
  );
  return celda.closest('tr') as HTMLElement;
};

describe('InformePage (informe imprimible)', () => {
  beforeEach(() => {
    restablecerRepositorioFalso(repositorio);
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(finalizada());
  });

  it('identifica la evaluación: título, software, organización, fecha, decisor y cálculo de IS', async () => {
    renderizar();
    const informe = await screen.findByRole('article', { name: 'Informe de evaluación' });
    expect(
      within(informe).getByRole('heading', { level: 1, name: 'Plataforma de aprendizaje' }),
    ).toBeInTheDocument();
    expect(informe).toHaveTextContent('Moodle 4.4');
    expect(informe).toHaveTextContent('GPL v3');
    expect(informe).toHaveTextContent('Universidad Estatal de Milagro');
    expect(informe).toHaveTextContent('Educación');
    expect(informe).toHaveTextContent('08/10/2026');
    expect(informe).toHaveTextContent('Ana Pérez');
    expect(informe).toHaveTextContent('Cálculo inicial de la tesis');
  });

  it('muestra la recomendación guardada con las causas', async () => {
    renderizar();
    const tarjeta = await screen.findByRole('region', { name: 'Recomendación' });
    expect(within(tarjeta).getByText('C', { selector: '[data-codigo]' })).toBeVisible();
    expect(within(tarjeta).getByText('Texto guardado al finalizar')).toBeVisible();
    expect(tarjeta).toHaveTextContent('Soporte');
    expect(tarjeta).toHaveTextContent('Debilidad');
  });

  it('tabla por factor: IS, ID, IR, PM y FODA en texto', async () => {
    renderizar();
    await screen.findByRole('table', { name: 'Resultados por factor' });
    const compatibilidad = fila('Compatibilidad');
    expect(compatibilidad).toHaveTextContent('Externo');
    expect(compatibilidad).toHaveTextContent('Importante'); // IS 3 e IR 3
    expect(compatibilidad).toHaveTextContent('Fundamental'); // ID 4
    expect(compatibilidad).toHaveTextContent('4,00');
    expect(compatibilidad).toHaveTextContent('Oportunidad');
    expect(fila('Soporte')).toHaveTextContent('1,50');
    expect(fila('Soporte')).toHaveTextContent('Debilidad');
  });

  it('los factores excluidos y los pendientes se dicen con texto y no se clasifican', async () => {
    renderizar();
    await screen.findByRole('table', { name: 'Resultados por factor' });
    expect(fila('Usabilidad')).toHaveTextContent('Se excluye');
    expect(fila('Formación')).toHaveTextContent('Pendiente');
    expect(fila('Formación')).toHaveTextContent('no cuenta para la recomendación');
    expect(within(fila('Formación')).queryByText('Fortaleza')).not.toBeInTheDocument();
  });

  it('detalla el cumplimiento de cada subfactor de los factores relevantes, con «Sin valorar»', async () => {
    renderizar();
    const detalle = await screen.findByRole('region', { name: 'Detalle por subfactor' });
    expect(detalle).toHaveTextContent('Es compatible con los formatos abiertos');
    expect(detalle).toHaveTextContent('Cumple el requisito');
    expect(detalle).toHaveTextContent('No cumple el requisito');
    expect(detalle).toHaveTextContent('Desconozco si cumple');
    expect(detalle).toHaveTextContent('El personal recibe formación suficiente');
    expect(detalle).toHaveTextContent('Sin valorar');
    // Usabilidad se excluyó: sus subfactores no se valoran.
    expect(detalle).not.toHaveTextContent('La interfaz es fácil de aprender');
  });

  it('incluye la matriz FODA sin botones (es un documento)', async () => {
    renderizar();
    await screen.findByRole('group', { name: 'Matriz FODA' });
    const matriz = screen.getByRole('group', { name: 'Matriz FODA' });
    expect(within(matriz).queryByRole('button')).not.toBeInTheDocument();
    expect(matriz).toHaveTextContent('Compatibilidad');
  });

  it('el botón imprime con la ventana de impresión del navegador', async () => {
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderizar();
    await screen.findByRole('article', { name: 'Informe de evaluación' });
    await userEvent.click(screen.getByRole('button', { name: /Imprimir o guardar como PDF/ }));
    expect(imprimir).toHaveBeenCalledTimes(1);
    imprimir.mockRestore();
  });

  it('una evaluación en curso avisa que es un borrador y deriva la recomendación', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(evaluacion());
    renderizar();
    expect(await screen.findByText(/Borrador: la evaluación no está finalizada/)).toBeVisible();
    const tarjeta = screen.getByRole('region', { name: 'Recomendación' });
    expect(within(tarjeta).getByText('C', { selector: '[data-codigo]' })).toBeVisible();
  });

  it('una finalizada no muestra el aviso de borrador', async () => {
    renderizar();
    await screen.findByRole('article', { name: 'Informe de evaluación' });
    expect(screen.queryByText(/Borrador:/)).not.toBeInTheDocument();
  });

  it('sin factores evaluados el informe dice que no hay recomendación', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(evaluacion({ valoraciones: [] }));
    renderizar();
    expect(await screen.findByRole('heading', { name: 'Sin recomendación' })).toBeInTheDocument();
  });

  it('«Atrás» vuelve a los resultados', async () => {
    renderizar();
    await screen.findByRole('article', { name: 'Informe de evaluación' });
    await userEvent.click(screen.getByRole('button', { name: /Atrás/ }));
    expect(await screen.findByTestId('ubicacion')).toHaveTextContent('/evaluaciones/7/resultados');
  });

  it('una evaluación inexistente lo dice', async () => {
    vi.mocked(repositorio.leerEvaluacion).mockResolvedValue(null);
    renderizar();
    expect(await screen.findByText('No se encontró la evaluación.')).toBeInTheDocument();
  });

  it('la hoja de estilos trae las reglas @media print del informe', () => {
    const css = readFileSync('src/styles/informe.css', 'utf8');
    expect(css).toMatch(/@media print/);
    expect(css).toMatch(/@page/);
    expect(css).toMatch(/\.informe/);
  });
});
