import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DetalleCalculoPanel } from './DetalleCalculoPanel';
import { CALCULO_IA, CATALOGO, crearApiFalsa, definido, renderAdmin } from './pruebas';

const PUBLICADO = {
  ...CALCULO_IA,
  id: 3,
  estado: 'publicado' as const,
  vigente: true,
  anioInicio: 2021,
  anioFin: 2025,
};
const factor = definido(CATALOGO[0]);
const sub1 = definido(factor.subfactores[0]);

function referencia(id: number, parcial: Record<string, unknown> = {}) {
  return {
    id,
    idSubfactor: sub1.id,
    titulo: `Aceptado ${id}`,
    anio: 2022,
    doi: `10.1/a${id}`,
    base: 'openalex',
    confianza: null,
    evidencia: null,
    ...parcial,
  };
}

async function abrirFactor(api: ReturnType<typeof crearApiFalsa>) {
  api.obtenerCalculo.mockResolvedValue(PUBLICADO);
  renderAdmin(<DetalleCalculoPanel id={3} onCerrar={() => undefined} />, { api });
  const panel = await screen.findByRole('dialog', { name: 'Recálculo IA 2021–2025' });
  await userEvent.click(await within(panel).findByRole('button', { name: factor.nombre }));
  return panel;
}

describe('DetalleCalculoPanel (P-10, trazabilidad #46)', () => {
  it('carga aceptados y rechazados una sola vez y los muestra por subfactor con pestañas', async () => {
    const api = crearApiFalsa({
      referencias: vi
        .fn()
        .mockResolvedValue([
          referencia(1, { titulo: 'Aceptado bajo', confianza: 0.75, evidencia: 'Cumple en parte' }),
          referencia(2, { titulo: 'Aceptado alto', confianza: 0.97, evidencia: 'Cumple del todo' }),
        ]),
      rechazadas: vi.fn().mockResolvedValue([
        {
          id: 5,
          idSubfactor: sub1.id,
          titulo: 'Rechazado por la IA',
          anio: 2021,
          doi: '10.9/z',
          base: 'openalex',
          confianza: 0.35,
          evidencia: 'No trata el subfactor',
        },
      ]),
    });
    const panel = await abrirFactor(api);
    const sub = within(await within(panel).findByRole('region', { name: 'Subfactor 1' }));
    expect(api.referencias).toHaveBeenCalledWith(3);
    expect(api.rechazadas).toHaveBeenCalledWith(3);

    const aceptados = sub.getByRole('tabpanel', { name: 'Aceptados' });
    expect(
      within(aceptados)
        .getAllByRole('heading', { level: 4 })
        .map((h) => h.textContent),
    ).toEqual(['Aceptado alto', 'Aceptado bajo']);
    expect(aceptados).toHaveTextContent('Cumple del todo');
    expect(panel).not.toHaveTextContent('sin datos de clasificación');

    await userEvent.click(sub.getByRole('tab', { name: 'Rechazados' }));
    const rechazados = sub.getByRole('tabpanel', { name: 'Rechazados' });
    expect(rechazados).toHaveTextContent('Rechazado por la IA');
    expect(rechazados).toHaveTextContent('No trata el subfactor');
    expect(within(rechazados).getByRole('link', { name: 'DOI 10.9/z' })).toHaveAttribute(
      'href',
      'https://doi.org/10.9/z',
    );

    // Otro factor: los datos ya están cargados.
    await userEvent.click(
      within(panel).getByRole('button', { name: definido(CATALOGO[1]).nombre }),
    );
    expect(api.referencias).toHaveBeenCalledTimes(1);
    expect(api.rechazadas).toHaveBeenCalledTimes(1);
  });

  it('un cálculo previo a la trazabilidad dice «sin datos de clasificación»', async () => {
    const api = crearApiFalsa({
      referencias: vi.fn().mockResolvedValue([referencia(1, { titulo: 'Antiguo' })]),
    });
    const panel = await abrirFactor(api);
    expect(await within(panel).findByText(/sin datos de clasificación/)).toBeInTheDocument();
    expect(within(panel).getByText('Antiguo')).toBeInTheDocument();
  });

  it('si fallan los rechazados avisa del error en vez de mostrar datos a medias', async () => {
    const api = crearApiFalsa({
      rechazadas: vi.fn().mockRejectedValue(new Error('sin permiso para leer rechazados')),
    });
    const panel = await abrirFactor(api);
    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'sin permiso para leer rechazados',
    );
  });
});
