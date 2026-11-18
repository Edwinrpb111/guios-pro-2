import { validarNuevoRecalculo } from './formulario';

describe('validarNuevoRecalculo (P-09)', () => {
  const valido = { anioInicio: '2020', anioFin: '2025', fuentes: ['openalex', 'crossref'] };

  it('convierte un formulario válido en la entrada de recalculo-iniciar', () => {
    expect(validarNuevoRecalculo(valido)).toEqual({
      entrada: { anioInicio: 2020, anioFin: 2025, fuentes: ['openalex', 'crossref'] },
    });
  });

  it('rechaza años que no son enteros entre 1900 y 2100', () => {
    for (const anio of ['', 'dos mil', '2020.5', '1899', '2101']) {
      expect(validarNuevoRecalculo({ ...valido, anioInicio: anio }).error).toMatch(/año/);
    }
  });

  it('rechaza un rango invertido', () => {
    expect(validarNuevoRecalculo({ ...valido, anioInicio: '2026' }).error).toMatch(/mayor/);
  });

  it('exige al menos una fuente bibliográfica conocida', () => {
    expect(validarNuevoRecalculo({ ...valido, fuentes: [] }).error).toMatch(/fuente/);
    expect(validarNuevoRecalculo({ ...valido, fuentes: ['scopus'] }).error).toMatch(/fuente/);
  });
});
