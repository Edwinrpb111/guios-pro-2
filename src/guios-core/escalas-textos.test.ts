import {
  ALCANCES,
  CUMPLIMIENTO,
  FODA,
  IMPORTANCIA,
  esCumplimiento,
  esImportancia,
} from './escalas';
import { TEXTOS_RECOMENDACION } from './textos';

describe('escalas (§4.2)', () => {
  it('importancia 1..4 con sus etiquetas', () => {
    expect(IMPORTANCIA).toEqual({
      1: 'Irrelevante',
      2: 'Opcional',
      3: 'Importante',
      4: 'Fundamental',
    });
  });

  it('cumplimiento 1..4 con sus etiquetas', () => {
    expect(CUMPLIMIENTO).toEqual({
      1: 'No cumple el requisito',
      2: 'Desconozco si cumple',
      3: 'Cumple parcialmente',
      4: 'Cumple el requisito',
    });
  });

  it('alcances de evaluación y clasificaciones FODA', () => {
    expect(ALCANCES).toEqual(['Interno', 'Externo']);
    expect(FODA).toEqual(['Fortaleza', 'Debilidad', 'Oportunidad', 'Amenaza']);
  });

  it('reconoce solo enteros 1..4', () => {
    expect([1, 2, 3, 4].every(esImportancia)).toBe(true);
    expect([0, 5, 2.5, Number.NaN].some(esImportancia)).toBe(false);
    expect(esCumplimiento(4)).toBe(true);
    expect(esCumplimiento(0)).toBe(false);
  });
});

describe('textos de las recomendaciones (§4.4)', () => {
  it('A = adoptar, C = posponer (versión de la tesis, no la del Excel)', () => {
    expect(TEXTOS_RECOMENDACION.A.titulo).toBe('Adoptar el software evaluado');
    expect(TEXTOS_RECOMENDACION.B.titulo).toBe('Es posible adoptar, con matices');
    expect(TEXTOS_RECOMENDACION.C.titulo).toBe('Analizar la adopción; debería posponerse');
  });

  it('cada texto es el de la tesis', () => {
    expect(TEXTOS_RECOMENDACION.A.texto).toMatch(/^Todos los factores evaluados son fortalezas/);
    expect(TEXTOS_RECOMENDACION.B.texto).toMatch(/evitar costes ocultos\)\.$/);
    expect(TEXTOS_RECOMENDACION.C.texto).toMatch(/facilidad de despliegue\)\.$/);
  });
});
