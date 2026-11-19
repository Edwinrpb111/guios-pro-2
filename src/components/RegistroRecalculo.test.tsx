import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LoteRegistro, PasoRegistro, RegistroPaso } from '../admin/tipos';
import { SIN_TOKENS } from '../admin/pruebas';
import { formatearDuracion, formatearHora } from './formato';
import { RegistroRecalculo } from './RegistroRecalculo';

const PASO_BASE: PasoRegistro = {
  idSubfactor: 105,
  nombre: 'Costo de licencias',
  estado: 'hecho',
  iniciadoEn: '2026-11-22T10:00:00Z',
  duracionMs: 4321,
  candidatos: 25,
  aceptados: 9,
  detalle: null,
  registro: null,
};

const REGISTRO_OK: RegistroPaso = {
  intento: 1,
  proveedor: 'gemini',
  busqueda: [
    { fuente: 'openalex', ms: 1234, candidatos: 25, error: null },
    { fuente: 'crossref', ms: 800, candidatos: 12, error: null },
  ],
  lotes: [
    { n: 1, tamano: 10, ms: 2345, reintentos: 0, resultado: 'ok', aceptados: 3, ...SIN_TOKENS },
    { n: 2, tamano: 10, ms: 1500, reintentos: 1, resultado: 'ok', aceptados: 6, ...SIN_TOKENS },
  ],
  etapa: null,
  lotesTotal: 2,
  aceptados: 9,
  resultado: 'hecho',
  mensaje: null,
};

const PASO_OK: PasoRegistro = { ...PASO_BASE, registro: REGISTRO_OK };

const PASO_FALLO: PasoRegistro = {
  ...PASO_BASE,
  idSubfactor: 106,
  nombre: 'Comunidad activa',
  estado: 'pendiente',
  duracionMs: 9000,
  aceptados: 0,
  registro: {
    intento: 2,
    proveedor: 'gemini',
    busqueda: [
      { fuente: 'crossref', ms: 40000, candidatos: null, error: 'Crossref respondió 503.' },
    ],
    lotes: [
      {
        n: 1,
        tamano: 10,
        ms: 60000,
        reintentos: 3,
        resultado: 'reintento_agotado',
        aceptados: 0,
        ...SIN_TOKENS,
      },
    ],
    etapa: null,
    lotesTotal: 1,
    aceptados: 0,
    resultado: 'pausado',
    mensaje: 'Gemini no respondió tras varios reintentos.',
  },
};

const PASO_CORRIENDO: PasoRegistro = {
  ...PASO_BASE,
  idSubfactor: 107,
  nombre: 'Soporte comercial',
  estado: 'pendiente',
  duracionMs: null,
  candidatos: 0,
  aceptados: 0,
};

const REGISTRO_VACIO: RegistroPaso = {
  intento: null,
  proveedor: null,
  busqueda: [],
  lotes: [],
  etapa: null,
  lotesTotal: null,
  aceptados: null,
  resultado: null,
  mensaje: null,
};

function mostrar(
  pasos: PasoRegistro[],
  extra: Partial<Parameters<typeof RegistroRecalculo>[0]> = {},
) {
  return render(<RegistroRecalculo pasos={pasos} enMarcha={false} {...extra} />);
}

function tarjeta(nombre: string) {
  const item = screen.getByText(nombre).closest('li');
  if (item === null) throw new Error(`No hay paso «${nombre}»`);
  return within(item);
}

describe('formatearDuracion y formatearHora', () => {
  it.each([
    [850, '850 ms'],
    [1234, '1,2 s'],
    [59_949, '59,9 s'],
    [125_000, '2 min 5 s'],
    [60_000, '1 min 0 s'],
  ])('%i ms se escribe «%s»', (ms, texto) => {
    expect(formatearDuracion(ms)).toBe(texto);
  });

  it.each([null, undefined, Number.NaN, -1])('una duración no válida (%s) es una raya', (ms) => {
    expect(formatearDuracion(ms)).toBe('—');
  });

  it('la hora usa 24 h y una fecha inválida es una raya', () => {
    expect(formatearHora('2026-11-22T10:00:00Z')).toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(formatearHora('no es fecha')).toBe('—');
    expect(formatearHora(null)).toBe('—');
  });
});

describe('RegistroRecalculo', () => {
  it('es un panel plegable con el título «Registro del recálculo»', () => {
    mostrar([PASO_OK]);
    const resumen = screen.getByText('Registro del recálculo');
    expect(resumen.closest('summary')).not.toBeNull();
    expect(resumen.closest('details')).toHaveProperty('open', false);
  });

  it('con `abiertoInicial` el panel arranca abierto', () => {
    mostrar([PASO_OK], { abiertoInicial: true });
    expect(screen.getByText('Registro del recálculo').closest('details')).toHaveProperty(
      'open',
      true,
    );
  });

  it('un paso correcto muestra estado, intento, búsquedas, lotes y aceptados', () => {
    mostrar([PASO_OK]);
    const paso = tarjeta('Costo de licencias');
    expect(paso.getByText('hecho')).toBeInTheDocument();
    expect(paso.getAllByText(formatearDuracion(4321)).length).toBeGreaterThan(0);
    expect(paso.getByText(/Intento 1/)).toBeInTheDocument();
    expect(paso.getByText(/gemini/)).toBeInTheDocument();
    expect(paso.getByText(/OpenAlex: 25 candidatos · 1,2 s/)).toBeInTheDocument();
    expect(paso.getByText(/Crossref: 12 candidatos · 800 ms/)).toBeInTheDocument();
    expect(
      paso.getByText(/Lote 1 \(10\): 2,3 s · 0 reintentos · correcto · 3 aceptados/),
    ).toBeInTheDocument();
    expect(
      paso.getByText(/Lote 2 \(10\): 1,5 s · 1 reintento · correcto · 6 aceptados/),
    ).toBeInTheDocument();
    expect(paso.getByText(/Aceptados: 9/)).toBeInTheDocument();
  });

  it('un paso fallido muestra el resultado de cada lote, el error de la fuente y el mensaje', () => {
    mostrar([PASO_FALLO]);
    const paso = tarjeta('Comunidad activa');
    expect(paso.getByText('pausado')).toBeInTheDocument();
    expect(paso.getByText(/Intento 2/)).toBeInTheDocument();
    expect(paso.getByText(/Crossref: Crossref respondió 503\./)).toBeInTheDocument();
    expect(paso.getByText(/reintentos agotados/)).toBeInTheDocument();
    expect(paso.getByText(/3 reintentos/)).toBeInTheDocument();
    expect(paso.getByText('Gemini no respondió tras varios reintentos.')).toBeInTheDocument();
  });

  it('un paso en error sin registro muestra el detalle guardado', () => {
    mostrar([{ ...PASO_BASE, estado: 'error', detalle: 'La IA devolvió texto inválido.' }]);
    const paso = tarjeta('Costo de licencias');
    expect(paso.getByText('error')).toBeInTheDocument();
    expect(paso.getByText('La IA devolvió texto inválido.')).toBeInTheDocument();
    expect(paso.getByText(/no tiene registro detallado/i)).toBeInTheDocument();
  });

  it('un paso iniciado sin duración está «en curso…» si el recálculo corre', () => {
    mostrar([PASO_CORRIENDO], { enMarcha: true });
    const paso = tarjeta('Soporte comercial');
    expect(paso.getAllByText('en curso…').length).toBeGreaterThan(0);
    expect(paso.queryByText('cortado')).toBeNull();
  });

  it('un paso iniciado sin duración está «cortado» si el recálculo no corre', () => {
    mostrar([PASO_CORRIENDO], { enMarcha: false });
    const paso = tarjeta('Soporte comercial');
    expect(paso.getAllByText('cortado').length).toBeGreaterThan(0);
    expect(paso.queryByText('en curso…')).toBeNull();
  });

  it('solo el paso más reciente puede estar en curso; uno anterior sin duración quedó cortado', () => {
    const anterior = { ...PASO_CORRIENDO, idSubfactor: 108, nombre: 'Licencia abierta' };
    mostrar([PASO_CORRIENDO, anterior], { enMarcha: true });
    expect(tarjeta('Soporte comercial').getAllByText('en curso…').length).toBeGreaterThan(0);
    expect(tarjeta('Licencia abierta').getAllByText('cortado').length).toBeGreaterThan(0);
  });

  it.each([
    ['null', null],
    ['campos nulos y listas vacías', REGISTRO_VACIO],
  ])('un registro malformado (%s) no rompe el panel', (_nombre, registro) => {
    mostrar([{ ...PASO_BASE, registro }]);
    const paso = tarjeta('Costo de licencias');
    expect(paso.getByText('hecho')).toBeInTheDocument();
    expect(paso.getByText(/Aceptados: 9/)).toBeInTheDocument();
  });

  it('un lote con campos nulos usa rayas', () => {
    const lote = {
      n: null,
      tamano: null,
      ms: null,
      reintentos: null,
      resultado: null,
      aceptados: null,
      ...SIN_TOKENS,
    };
    mostrar([{ ...PASO_BASE, registro: { ...REGISTRO_OK, busqueda: [], lotes: [lote] } }]);
    expect(tarjeta('Costo de licencias').getByText(/Lote —: — · — · — · —/)).toBeInTheDocument();
  });

  it('un resultado de lote desconocido se muestra tal cual', () => {
    const lote = { ...(REGISTRO_OK.lotes[0] as LoteRegistro), resultado: 'rareza_nueva' };
    mostrar([{ ...PASO_BASE, registro: { ...REGISTRO_OK, lotes: [lote] } }]);
    expect(tarjeta('Costo de licencias').getByText(/rareza_nueva/)).toBeInTheDocument();
  });

  it('sin nombre usa el código del subfactor', () => {
    mostrar([{ ...PASO_BASE, nombre: null }]);
    expect(screen.getByText('Subfactor 105')).toBeInTheDocument();
  });

  it('sin pasos dice que aún no hay registro', () => {
    mostrar([]);
    expect(screen.getByText(/Aún no hay pasos registrados/)).toBeInTheDocument();
  });

  it('un error de carga se anuncia como alerta y «Actualizar» emite el evento', async () => {
    const onActualizar = vi.fn();
    mostrar([], { error: 'sin permiso', onActualizar });
    expect(screen.getByRole('alert')).toHaveTextContent('sin permiso');
    await userEvent.click(screen.getByRole('button', { name: /actualizar/i }));
    expect(onActualizar).toHaveBeenCalledOnce();
  });

  it('sin `onActualizar` no hay botón', () => {
    mostrar([PASO_OK]);
    expect(screen.queryByRole('button', { name: /actualizar/i })).toBeNull();
  });
});
