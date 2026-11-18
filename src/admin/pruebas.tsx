/** Ayudas de prueba del módulo de administración: API falsa y render con router. */
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import tesis from '../guios-core/fixtures/is_tesis.json';
import type { Importancia } from '../guios-core';
import { ContextoApiAdmin } from './contexto';
import type {
  ApiAdmin,
  CalculoResumen,
  ConfiguracionRecalculo,
  FactorCatalogo,
  FilaSugerida,
} from './tipos';

export const CALCULO_TESIS: CalculoResumen = {
  id: 1,
  origen: 'tesis',
  anioInicio: null,
  anioFin: null,
  etiquetaRango: 'RSL de la tesis',
  basesDatos: 'IEEE, ACM, Scopus, WoS',
  fecha: '2026-11-17T00:00:00Z',
  vigente: true,
  estado: 'publicado',
  progreso: 0,
  mensajeError: null,
  parametros: null,
};

export const CALCULO_IA: CalculoResumen = {
  id: 2,
  origen: 'ia',
  anioInicio: 2020,
  anioFin: 2025,
  etiquetaRango: null,
  basesDatos: 'OpenAlex, Crossref',
  fecha: '2026-11-18T00:00:00Z',
  vigente: false,
  estado: 'en_proceso',
  progreso: 0,
  mensajeError: null,
  parametros: {
    anio_inicio: 2020,
    anio_fin: 2025,
    fuentes: ['openalex', 'crossref'],
    umbral: 0.7,
    modelo: 'fake',
    proveedor_llm: 'fake',
    version_prompt: 'v1',
    max_candidatos: 50,
  },
};

/** Catálogo de 18 factores con los nombres y NS de la Tabla 5.3. */
export const CATALOGO: FactorCatalogo[] = tesis.factores.map((f, i) => ({
  id: i + 1,
  nombre: f.nombre,
  orden: i + 1,
  subfactores: Array.from({ length: f.ns }, (_, k) => ({
    id: (i + 1) * 100 + k + 1,
    enunciado: `${f.nombre}: subfactor ${k + 1}`,
    orden: k + 1,
  })),
}));

/** Filas de IS de la tesis (Tabla 5.3). */
export const FILAS_TESIS: FilaSugerida[] = tesis.factores.map((f, i) => ({
  idFactor: i + 1,
  subfactores: f.ns,
  citas: f.tc,
  razon: f.tc / f.ns,
  ie: 3,
  il: f.il as Importancia,
  is: f.is as Importancia,
}));

export const CONTEO_TESIS = FILAS_TESIS.map(({ idFactor, subfactores, citas }) => ({
  idFactor,
  subfactores,
  citas,
}));

/** Configuración del recálculo de prueba: Gemini con su clave guardada (issue #33). */
export const CONFIGURACION_PRUEBA: ConfiguracionRecalculo = {
  parametros: {
    proveedorLlm: 'gemini',
    modelo: 'gemini-3.1-flash-lite',
    umbral: 0.7,
    maxCandidatos: null,
    crossrefMailto: 'equipo@unemi.edu.ec',
  },
  actualizadoEn: '2026-11-18T15:00:00Z',
  claves: [
    { nombre: 'GEMINI_API_KEY', configurada: true, actualizadaEn: '2026-11-18T15:00:00Z' },
    { nombre: 'OPENALEX_API_KEY', configurada: false, actualizadaEn: null },
  ],
  cambios: [
    {
      id: 2,
      cambio: 'clave GEMINI_API_KEY guardada',
      realizadoPor: 'Ada Admin',
      realizadoEn: '2026-11-18T15:00:00Z',
    },
    { id: 1, cambio: 'parametros', realizadoPor: null, realizadoEn: '2026-11-18T14:00:00Z' },
  ],
};

/** Valor que la prueba sabe que existe (evita aserciones no nulas). */
export function definido<T>(valor: T | undefined): T {
  if (valor === undefined) throw new Error('Se esperaba un valor definido en la prueba');
  return valor;
}

export type ApiFalsa = { [K in keyof ApiAdmin]: ReturnType<typeof vi.fn> & ApiAdmin[K] };

export function crearApiFalsa(parcial: Partial<ApiAdmin> = {}): ApiFalsa {
  const api: ApiAdmin = {
    listarCalculos: vi.fn().mockResolvedValue([CALCULO_IA, CALCULO_TESIS]),
    obtenerCalculo: vi.fn().mockResolvedValue(CALCULO_IA),
    filasSugeridas: vi.fn().mockResolvedValue(FILAS_TESIS),
    catalogo: vi.fn().mockResolvedValue(CATALOGO),
    referencias: vi.fn().mockResolvedValue([]),
    iniciarRecalculo: vi.fn().mockResolvedValue(2),
    pasoRecalculo: vi.fn().mockResolvedValue({ progreso: 18, pendientes: 0, estado: 'en_proceso' }),
    pausar: vi.fn().mockResolvedValue(undefined),
    conteoCitas: vi.fn().mockResolvedValue(CONTEO_TESIS),
    guardarResultado: vi.fn().mockResolvedValue(undefined),
    publicar: vi.fn().mockResolvedValue(undefined),
    descartar: vi.fn().mockResolvedValue(undefined),
    obtenerConfiguracion: vi.fn().mockResolvedValue(CONFIGURACION_PRUEBA),
    guardarParametros: vi.fn().mockResolvedValue(undefined),
    guardarClave: vi.fn().mockResolvedValue(undefined),
    borrarClave: vi.fn().mockResolvedValue(undefined),
    ...parcial,
  };
  return api as ApiFalsa;
}

/** Renderiza `ui` en `ruta` (con el patrón `patron`) y la API falsa en el contexto. */
export function renderAdmin(
  ui: ReactElement,
  {
    api = crearApiFalsa(),
    ruta = '/',
    patron = '*',
  }: { api?: ApiAdmin; ruta?: string; patron?: string } = {},
) {
  return {
    api,
    ...render(
      <ContextoApiAdmin.Provider value={api}>
        <MemoryRouter initialEntries={[ruta]}>
          <Routes>
            <Route path={patron} element={ui} />
            <Route path="*" element={<p>Otra ruta</p>} />
          </Routes>
        </MemoryRouter>
      </ContextoApiAdmin.Provider>,
    ),
  };
}
