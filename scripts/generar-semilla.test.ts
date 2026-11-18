import { readFileSync } from 'node:fs';
import { CATALOGO_TESIS, generarSemilla, leerSubfactores } from './generar-semilla';
import { recalcularIS } from '../src/guios-core';

const csv = readFileSync('docs/fuentes/guiosad_data.csv', 'utf8');

describe('leerSubfactores', () => {
  const subfactores = leerSubfactores(csv);

  it('lee los 61 subfactores en 3 dimensiones y 18 factores', () => {
    expect(subfactores).toHaveLength(61);
    expect(new Set(subfactores.map((s) => s.dimension)).size).toBe(3);
    expect(new Set(subfactores.map((s) => s.factor)).size).toBe(18);
  });

  it('corrige las dos erratas del CSV (BRIEF §4.1)', () => {
    const textos = subfactores.map((s) => s.enunciado).join('\n');
    expect(textos).not.toContain('códigofuente');
    expect(textos).not.toContain('es una sistemas');
    expect(textos).toContain('sin necesidad de modificar el código fuente');
    expect(textos).toContain(
      'El software es un sistema de administración de base de datos independiente',
    );
  });

  it('rechaza un CSV sin la cabecera esperada', () => {
    expect(() => leerSubfactores('a\tb\tc\nx\ty\tz')).toThrow(/cabecera/);
  });

  it('rechaza una fila incompleta', () => {
    expect(() => leerSubfactores('Dimensión\tFactor\tSubfactor\nTecnológica\tPrueba')).toThrow(
      /fila 2/,
    );
  });
});

describe('CATALOGO_TESIS (Tabla 5.3, BRIEF §4.1)', () => {
  it('tiene los 18 factores con las IS de la tesis, no las de factors.csv', () => {
    expect(CATALOGO_TESIS).toHaveLength(18);
    expect(CATALOGO_TESIS.find((f) => f.nombre === 'Usabilidad')?.is).toBe(2);
    expect(CATALOGO_TESIS.find((f) => f.nombre === 'Apoyo de la alta dirección')?.is).toBe(3);
    expect(CATALOGO_TESIS.find((f) => f.nombre === 'Soporte')?.alcance).toBe('Ambos');
  });

  it('IL e IS coinciden con el recálculo de guios-core sobre NS y TC', () => {
    const recalculo = recalcularIS(CATALOGO_TESIS.map((f) => ({ citas: f.tc, subfactores: f.ns })));
    expect(recalculo.factores.map((f) => f.il)).toEqual(CATALOGO_TESIS.map((f) => f.il));
    expect(recalculo.factores.map((f) => f.is)).toEqual(CATALOGO_TESIS.map((f) => f.is));
  });

  it('cada NS coincide con los subfactores del CSV', () => {
    const subfactores = leerSubfactores(csv);
    for (const f of CATALOGO_TESIS) {
      const delCsv = subfactores.filter((s) => s.factor === f.nombre);
      expect(delCsv.length, f.nombre).toBe(f.ns);
      expect(
        delCsv.every((s) => s.dimension === f.dimension),
        f.nombre,
      ).toBe(true);
    }
  });
});

describe('generarSemilla', () => {
  const sql = generarSemilla(csv);

  it('inserta el cálculo de la tesis publicado y vigente', () => {
    expect(sql).toContain(
      "insert into public.calculo_sugerida (origen, etiqueta_rango, bases_datos, estado, vigente, progreso)\nvalues ('tesis', 'RSL de la tesis', 'IEEE, ACM, Scopus, WoS', 'publicado', true, 18);",
    );
  });

  it('guarda razón, IE, IL e IS de cada factor', () => {
    expect(sql).toContain("('Compatibilidad', 8, 33, 4.1250, 3, 3, 3)");
    expect(sql).toContain("('Documentación', 11, 20, 1.8182, 3, 1, 2)");
  });

  it('escapa las comillas simples', () => {
    const conComilla = csv.replace('Una empresa proporciona', "Una empresa d'ejemplo proporciona");
    expect(generarSemilla(conComilla)).toContain("Una empresa d''ejemplo proporciona");
  });

  it('falla si un factor del CSV no está en la Tabla 5.3', () => {
    expect(() => generarSemilla(csv.replace(/\tPrueba\t/, '\tPruebas\t'))).toThrow(/Pruebas/);
  });

  it('falla si el NS del CSV no coincide con la Tabla 5.3', () => {
    const sinUnaFila = csv
      .split('\n')
      .filter((_, i) => i !== 1)
      .join('\n');
    expect(() => generarSemilla(sinUnaFila)).toThrow(/Compatibilidad/);
  });

  it('supabase/seed.sql está al día con el generador', () => {
    expect(readFileSync('supabase/seed.sql', 'utf8')).toBe(sql);
  });
});
