import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AyudaMetodoContenido } from './AyudaMetodoContenido';

const importancia = [
  { valor: 1, nombre: 'Irrelevante' },
  { valor: 2, nombre: 'Opcional' },
  { valor: 3, nombre: 'Importante' },
  { valor: 4, nombre: 'Fundamental' },
];
const cumplimiento = [
  { valor: 1, nombre: 'No cumple el requisito' },
  { valor: 2, nombre: 'Desconozco si cumple' },
  { valor: 3, nombre: 'Cumple parcialmente' },
  { valor: 4, nombre: 'Cumple el requisito' },
];
const recomendaciones = [
  { codigo: 'A', titulo: 'Adoptar el software evaluado', texto: 'Texto de A.' },
  { codigo: 'B', titulo: 'Es posible adoptar, con matices', texto: 'Texto de B.' },
  { codigo: 'C', titulo: 'Analizar la adopción', texto: 'Texto de C.' },
];

function renderizar() {
  return render(
    <AyudaMetodoContenido
      importancia={importancia}
      cumplimiento={cumplimiento}
      recomendaciones={recomendaciones}
      umbralRelevancia={1}
      umbralFoda={3}
    />,
  );
}

describe('AyudaMetodoContenido', () => {
  it('organiza la ayuda en secciones con encabezado', () => {
    renderizar();
    const secciones = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(secciones).toEqual([
      '¿Qué evalúa GUIOS?',
      'Importancia: de dónde sale cada valor',
      'Qué factores se evalúan',
      'Cumplimiento de los subfactores',
      'Ponderación media y clasificación FODA',
      'La recomendación A, B o C',
    ]);
  });

  it('lista las cuatro importancias con su número y su nombre, siempre en texto', () => {
    renderizar();
    const escala = screen.getByRole('list', { name: 'Escala de importancia' });
    const items = within(escala).getAllByRole('listitem');
    expect(items.map((i) => i.textContent)).toEqual([
      '1 · Irrelevante',
      '2 · Opcional',
      '3 · Importante',
      '4 · Fundamental',
    ]);
  });

  it('explica cómo se llega a la IS y a la importancia relativa', () => {
    renderizar();
    const glosario = screen.getByText('IS', { selector: 'dt' }).closest('dl');
    expect(glosario).toHaveTextContent(/intersección de IE e IL/i);
    expect(glosario).toHaveTextContent(/cálculo vigente/i);
    expect(screen.getByText('IR', { selector: 'dt' }).nextElementSibling).toHaveTextContent(
      /intersección de ID e IS/i,
    );
  });

  it('el criterio de relevancia usa el umbral recibido, nombrando el nivel', () => {
    renderizar();
    expect(screen.getByText(/mayor que «Irrelevante» \(1\)/)).toBeInTheDocument();
  });

  it('lista las cuatro opciones de cumplimiento', () => {
    renderizar();
    const lista = screen.getByRole('list', { name: 'Escala de cumplimiento' });
    expect(
      within(lista)
        .getAllByRole('listitem')
        .map((i) => i.textContent),
    ).toEqual([
      '1 · No cumple el requisito',
      '2 · Desconozco si cumple',
      '3 · Cumple parcialmente',
      '4 · Cumple el requisito',
    ]);
  });

  it('describe la PM y el FODA con el umbral recibido y los cuatro resultados nombrados', () => {
    renderizar();
    const seccion = screen.getByRole('region', { name: 'Ponderación media y clasificación FODA' });
    expect(seccion).toHaveTextContent(/3 o más/);
    for (const nombre of ['Fortaleza', 'Debilidad', 'Oportunidad', 'Amenaza']) {
      expect(seccion).toHaveTextContent(nombre);
    }
  });

  it('muestra las tres recomendaciones con su letra, título y texto sin reescribirlos', () => {
    renderizar();
    const seccion = screen.getByRole('region', { name: 'La recomendación A, B o C' });
    for (const { codigo, titulo, texto } of recomendaciones) {
      expect(seccion).toHaveTextContent(`${codigo} · ${titulo}`);
      expect(seccion).toHaveTextContent(texto);
    }
  });
});
