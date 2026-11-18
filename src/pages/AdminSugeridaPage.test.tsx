import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CALCULO_IA,
  CALCULO_TESIS,
  CATALOGO,
  FILAS_TESIS,
  crearApiFalsa,
  definido,
  renderAdmin,
} from '../admin/pruebas';
import { AdminSugeridaPage } from './AdminSugeridaPage';

const PUBLICADO = {
  ...CALCULO_IA,
  id: 3,
  estado: 'publicado' as const,
  vigente: true,
  anioInicio: 2021,
  anioFin: 2025,
};
const TESIS_HISTORICA = { ...CALCULO_TESIS, vigente: false };

function montar(api = crearApiFalsa(), ruta = '/admin/sugerida') {
  return renderAdmin(<AdminSugeridaPage />, { api, ruta, patron: '/admin/sugerida' });
}

describe('AdminSugeridaPage (P-08)', () => {
  it('muestra el título de inmediato y luego el vigente, los indicadores y el historial', async () => {
    montar();
    expect(screen.getByRole('heading', { name: 'Importancia sugerida' })).toBeInTheDocument();

    const historial = await screen.findByRole('table', { name: 'Historial de cálculos' });
    const filas = within(historial).getAllByRole('row').slice(1);
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent('Recálculo IA 2020–2025');
    expect(filas[0]).toHaveTextContent('En proceso');
    expect(filas[1]).toHaveTextContent('Cálculo inicial de la tesis');
    expect(filas[1]).toHaveTextContent('Vigente');

    const vigente = screen.getByRole('region', { name: 'Cálculo vigente' });
    expect(vigente).toHaveTextContent('Cálculo inicial de la tesis');
    expect(screen.getByRole('region', { name: 'Factores con IS Importante' })).toHaveTextContent(
      String(FILAS_TESIS.filter((f) => f.is === 3).length),
    );
    expect(screen.getByRole('region', { name: 'Cálculos registrados' })).toHaveTextContent('2');
  });

  it('un publicado que ya no es vigente figura como histórico', async () => {
    const api = crearApiFalsa({
      listarCalculos: vi.fn().mockResolvedValue([PUBLICADO, TESIS_HISTORICA]),
    });
    montar(api);
    const historial = await screen.findByRole('table', { name: 'Historial de cálculos' });
    const [nuevo, tesis] = within(historial).getAllByRole('row').slice(1);
    expect(nuevo).toHaveTextContent('Vigente');
    expect(tesis).toHaveTextContent('Histórico');
    expect(api.filasSugeridas).toHaveBeenCalledWith(3);
  });

  it('con un recálculo sin terminar ofrece continuarlo y no deja iniciar otro', async () => {
    montar();
    const aviso = await screen.findByRole('status');
    expect(aviso).toHaveTextContent('Hay un recálculo en proceso');
    expect(within(aviso).getByRole('link', { name: 'Continuar el recálculo' })).toHaveAttribute(
      'href',
      '/admin/sugerida/2',
    );
    expect(screen.getByRole('button', { name: 'Nuevo recálculo' })).toBeDisabled();
  });

  it('sin recálculos pendientes enlaza a P-09 para iniciar uno', async () => {
    const api = crearApiFalsa({ listarCalculos: vi.fn().mockResolvedValue([CALCULO_TESIS]) });
    montar(api);
    expect(await screen.findByRole('link', { name: 'Nuevo recálculo' })).toHaveAttribute(
      'href',
      '/admin/sugerida/nuevo',
    );
  });

  it('si la carga falla lo dice en español', async () => {
    const api = crearApiFalsa({
      listarCalculos: vi.fn().mockRejectedValue(new Error('Sin conexión con Supabase')),
    });
    montar(api);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión con Supabase');
  });

  it('«Ver detalle» abre el panel P-10 y «Cerrar» lo quita', async () => {
    const usuario = userEvent.setup();
    const api = crearApiFalsa({ listarCalculos: vi.fn().mockResolvedValue([CALCULO_TESIS]) });
    api.obtenerCalculo.mockResolvedValue(CALCULO_TESIS);
    montar(api);

    await usuario.click(
      await screen.findByRole('button', { name: 'Ver detalle de Cálculo inicial de la tesis' }),
    );
    const panel = await screen.findByRole('dialog', { name: 'Cálculo inicial de la tesis' });
    expect(api.obtenerCalculo).toHaveBeenCalledWith(1);
    await waitFor(() => expect(within(panel).getAllByRole('row')).toHaveLength(19));
    expect(panel).toHaveTextContent('Tabla 5.3');

    await usuario.click(within(panel).getByRole('button', { name: 'Cerrar detalle' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('el detalle se abre desde la URL (?detalle=) y se cierra con Escape', async () => {
    const usuario = userEvent.setup();
    const api = crearApiFalsa();
    api.obtenerCalculo.mockResolvedValue(CALCULO_TESIS);
    montar(api, '/admin/sugerida?detalle=1');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await usuario.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('DetalleCalculoPanel (P-10)', () => {
  const COMPLETO = { ...PUBLICADO };
  const factor = definido(CATALOGO[0]);
  const sub1 = definido(factor.subfactores[0]);
  const sub2 = definido(factor.subfactores[1]);
  const otro = definido(definido(CATALOGO[1]).subfactores[0]);

  it('muestra los parámetros guardados (RNF-09) y las referencias de un factor por subfactor', async () => {
    const usuario = userEvent.setup();
    const api = crearApiFalsa({
      listarCalculos: vi.fn().mockResolvedValue([COMPLETO]),
      referencias: vi.fn().mockResolvedValue([
        {
          id: 1,
          idSubfactor: sub1.id,
          titulo: 'FLOSS y hardware',
          anio: 2022,
          doi: '10.1/a',
          base: 'openalex',
        },
        {
          id: 2,
          idSubfactor: sub1.id,
          titulo: 'Compatibilidad abierta',
          anio: 2023,
          doi: '10.1/b',
          base: 'crossref',
        },
        {
          id: 3,
          idSubfactor: otro.id,
          titulo: 'Otro factor',
          anio: 2021,
          doi: '10.1/c',
          base: 'openalex',
        },
      ]),
    });
    api.obtenerCalculo.mockResolvedValue(COMPLETO);
    montar(api, '/admin/sugerida?detalle=3');

    const panel = await screen.findByRole('dialog', { name: 'Recálculo IA 2021–2025' });
    const parametros = await within(panel).findByRole('region', { name: 'Parámetros del cálculo' });
    expect(parametros).toHaveTextContent('2020–2025');
    expect(parametros).toHaveTextContent('openalex, crossref');
    expect(parametros).toHaveTextContent('0,7');
    expect(parametros).toHaveTextContent('fake');

    await usuario.click(await within(panel).findByRole('button', { name: factor.nombre }));
    const refs = await within(panel).findByRole('region', {
      name: `Referencias de ${factor.nombre}`,
    });
    expect(api.referencias).toHaveBeenCalledWith(3);
    expect(refs).toHaveTextContent(sub1.enunciado);
    expect(refs).toHaveTextContent('FLOSS y hardware');
    expect(refs).toHaveTextContent('Compatibilidad abierta');
    expect(refs).not.toHaveTextContent('Otro factor');
    expect(refs).toHaveTextContent(`${sub2.enunciado}`);
    expect(refs).toHaveTextContent('Sin artículos aceptados');
    expect(within(refs).getByRole('link', { name: 'DOI 10.1/a' })).toHaveAttribute(
      'href',
      'https://doi.org/10.1/a',
    );
  });

  it('un cálculo sin resultados lo explica', async () => {
    const api = crearApiFalsa({ filasSugeridas: vi.fn().mockResolvedValue([]) });
    api.obtenerCalculo.mockResolvedValue({ ...CALCULO_IA, estado: 'pausado' });
    montar(api, '/admin/sugerida?detalle=2');
    expect(
      await screen.findByText('Este cálculo todavía no tiene resultados (Pausado).'),
    ).toBeInTheDocument();
  });

  it('un id inexistente lo informa', async () => {
    const api = crearApiFalsa();
    api.obtenerCalculo.mockResolvedValue(null);
    montar(api, '/admin/sugerida?detalle=99');
    expect(await screen.findByText('No existe el cálculo 99.')).toBeInTheDocument();
  });
});
