import { render, screen, within, type BoundFunctions, type queries } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ReferenciasFactor } from './ReferenciasFactor';
import type { FactorCatalogo, ReferenciaCalculo, ReferenciaRechazada } from './tipos';

const FACTOR: FactorCatalogo = {
  id: 1,
  nombre: 'Soporte',
  orden: 1,
  subfactores: [
    { id: 11, enunciado: 'Hay foros activos', orden: 1 },
    { id: 12, enunciado: 'Hay documentación', orden: 2 },
  ],
};

function aceptada(id: number, parcial: Partial<ReferenciaCalculo> = {}): ReferenciaCalculo {
  return {
    id,
    idSubfactor: 11,
    titulo: `Aceptado ${id}`,
    anio: 2022,
    doi: `10.1/a${id}`,
    base: 'openalex',
    confianza: 0.8,
    evidencia: `Porque ${id}`,
    ...parcial,
  };
}

function rechazada(id: number, parcial: Partial<ReferenciaRechazada> = {}): ReferenciaRechazada {
  return {
    id,
    idSubfactor: 11,
    titulo: `Rechazado ${id}`,
    anio: 2021,
    doi: `10.2/r${id}`,
    base: 'crossref',
    confianza: 0.3,
    evidencia: `No porque ${id}`,
    ...parcial,
  };
}

function montar(aceptadas: ReferenciaCalculo[], rechazadas: ReferenciaRechazada[]) {
  render(<ReferenciasFactor factor={FACTOR} referencias={aceptadas} rechazadas={rechazadas} />);
  return within(screen.getByRole('region', { name: 'Subfactor 1' }));
}

const titulos = (zona: BoundFunctions<typeof queries>) =>
  zona.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);

describe('ReferenciasFactor (P-10, trazabilidad)', () => {
  it('cada subfactor tiene pestañas «Aceptados» y «Rechazados» accesibles', () => {
    const sub = montar([aceptada(1)], [rechazada(9)]);
    const pestanas = sub.getAllByRole('tab');
    expect(pestanas.map((p) => p.textContent)).toEqual(['Aceptados', 'Rechazados']);
    expect(sub.getByRole('tablist', { name: 'Referencias del subfactor 1' })).toBeInTheDocument();
    expect(sub.getByRole('tab', { name: 'Aceptados' })).toHaveAttribute('aria-selected', 'true');
    expect(sub.getByRole('tab', { name: 'Rechazados' })).toHaveAttribute('aria-selected', 'false');
    const panel = sub.getByRole('tabpanel', { name: 'Aceptados' });
    expect(panel).toHaveTextContent('Aceptado 1');
    expect(sub.getByRole('tab', { name: 'Aceptados' })).toHaveAttribute('aria-controls', panel.id);
    // Solo la pestaña activa es alcanzable con Tab (patrón WAI-ARIA).
    expect(sub.getByRole('tab', { name: 'Rechazados' })).toHaveAttribute('tabindex', '-1');
  });

  it('los aceptados salen ordenados por confianza descendente con confianza, evidencia y DOI', () => {
    const sub = montar(
      [
        aceptada(1, { confianza: 0.71, evidencia: 'Evidencia baja' }),
        aceptada(2, { confianza: 0.95, evidencia: 'Evidencia alta' }),
        aceptada(3, { confianza: null, evidencia: null }),
      ],
      [rechazada(9)],
    );
    const panel = within(sub.getByRole('tabpanel', { name: 'Aceptados' }));
    expect(titulos(panel)).toEqual(['Aceptado 2', 'Aceptado 1', 'Aceptado 3']);
    const primero = within(panel.getAllByRole('listitem')[0] as HTMLElement);
    expect(primero.getByText('Confianza 0,95')).toBeInTheDocument();
    expect(primero.getByText('Evidencia alta')).toBeInTheDocument();
    expect(primero.getByRole('link', { name: 'DOI 10.1/a2' })).toHaveAttribute(
      'href',
      'https://doi.org/10.1/a2',
    );
    // Sin confianza ni evidencia no se inventa nada.
    const ultimo = within(panel.getAllByRole('listitem')[2] as HTMLElement);
    expect(ultimo.queryByText(/Confianza/)).not.toBeInTheDocument();
    expect(ultimo.queryByText(/Evidencia/)).not.toBeInTheDocument();
  });

  it('la pestaña «Rechazados» lista los candidatos por confianza descendente con evidencia y DOI', async () => {
    const usuario = userEvent.setup();
    const sub = montar(
      [aceptada(1)],
      [
        rechazada(7, { confianza: 0.1, evidencia: 'Habla de otra cosa' }),
        rechazada(8, { confianza: 0.6, evidencia: 'Casi cumple' }),
        rechazada(9, { idSubfactor: 12, titulo: 'De otro subfactor' }),
      ],
    );
    await usuario.click(sub.getByRole('tab', { name: 'Rechazados' }));
    expect(sub.getByRole('tab', { name: 'Rechazados' })).toHaveAttribute('aria-selected', 'true');
    const panel = within(sub.getByRole('tabpanel', { name: 'Rechazados' }));
    expect(titulos(panel)).toEqual(['Rechazado 8', 'Rechazado 7']);
    const primero = within(panel.getAllByRole('listitem')[0] as HTMLElement);
    expect(primero.getByText('Confianza 0,6')).toBeInTheDocument();
    expect(primero.getByText('Casi cumple')).toBeInTheDocument();
    expect(primero.getByRole('link', { name: 'DOI 10.2/r8' })).toHaveAttribute(
      'href',
      'https://doi.org/10.2/r8',
    );
    expect(panel.queryByText('De otro subfactor')).not.toBeInTheDocument();
  });

  it('las flechas, Inicio y Fin cambian de pestaña y la enfocan', async () => {
    const usuario = userEvent.setup();
    const sub = montar([aceptada(1)], [rechazada(9)]);
    sub.getByRole('tab', { name: 'Aceptados' }).focus();
    await usuario.keyboard('{ArrowRight}');
    expect(sub.getByRole('tab', { name: 'Rechazados' })).toHaveFocus();
    expect(sub.getByRole('tab', { name: 'Rechazados' })).toHaveAttribute('aria-selected', 'true');
    await usuario.keyboard('{Home}');
    expect(sub.getByRole('tab', { name: 'Aceptados' })).toHaveFocus();
    await usuario.keyboard('{End}');
    expect(sub.getByRole('tab', { name: 'Rechazados' })).toHaveFocus();
    await usuario.keyboard('{ArrowLeft}');
    expect(sub.getByRole('tab', { name: 'Aceptados' })).toHaveFocus();
  });

  it('muestra la evidencia como texto plano: nunca interpreta HTML', async () => {
    const usuario = userEvent.setup();
    const malicioso = '<img src=x onerror="alert(1)"><script>alert(2)</script><b>negrita</b>';
    const sub = montar(
      [aceptada(1, { evidencia: malicioso })],
      [rechazada(9, { evidencia: malicioso })],
    );
    const panelAceptados = sub.getByRole('tabpanel', { name: 'Aceptados' });
    expect(panelAceptados).toHaveTextContent(malicioso);
    expect(panelAceptados.querySelector('img, script')).toBeNull();
    expect(panelAceptados.querySelector('.admin-referencias__evidencia')?.children).toHaveLength(0);
    await usuario.click(sub.getByRole('tab', { name: 'Rechazados' }));
    const panelRechazados = sub.getByRole('tabpanel', { name: 'Rechazados' });
    expect(panelRechazados).toHaveTextContent(malicioso);
    expect(panelRechazados.querySelector('img, script')).toBeNull();
    expect(panelRechazados.querySelector('.admin-referencias__evidencia')?.children).toHaveLength(
      0,
    );
  });

  it('un cálculo sin datos de clasificación lo dice una vez y sigue listando los artículos', () => {
    render(
      <ReferenciasFactor
        factor={FACTOR}
        referencias={[
          aceptada(1, { confianza: null, evidencia: null }),
          aceptada(2, { idSubfactor: 12, confianza: null, evidencia: null }),
        ]}
        rechazadas={[]}
      />,
    );
    expect(screen.getAllByText(/sin datos de clasificación/)).toHaveLength(1);
    expect(screen.getByText('Aceptado 1')).toBeInTheDocument();
    expect(screen.getByText('Aceptado 2')).toBeInTheDocument();
  });

  it('con datos de clasificación no muestra el aviso de «sin datos»', () => {
    montar([aceptada(1)], []);
    expect(screen.queryByText(/sin datos de clasificación/)).not.toBeInTheDocument();
  });

  it('explica cuando un subfactor no tiene aceptados o no tiene rechazados', async () => {
    const usuario = userEvent.setup();
    const sub = montar([aceptada(1, { idSubfactor: 12 })], [rechazada(9)]);
    expect(sub.getByRole('tabpanel', { name: 'Aceptados' })).toHaveTextContent(
      'Sin artículos aceptados para este subfactor.',
    );
    const otro = within(screen.getByRole('region', { name: 'Subfactor 2' }));
    await usuario.click(otro.getByRole('tab', { name: 'Rechazados' }));
    expect(otro.getByRole('tabpanel', { name: 'Rechazados' })).toHaveTextContent(
      'Sin candidatos rechazados registrados para este subfactor.',
    );
  });
});
