/**
 * Datos y repositorio simulado para las pruebas de las pantallas: el catálogo es una
 * versión reducida (4 factores) con la misma forma que el real.
 */
import type { Repositorio } from '../datos/repositorio';
import type {
  CalculoImportancia,
  Catalogo,
  EvaluacionDetalle,
  ResumenEvaluacion,
} from '../datos/tipos';

export const catalogoPrueba: Catalogo = {
  subfactores: {
    100: 'Es compatible con los formatos abiertos',
    101: 'Se integra con los sistemas existentes',
    110: 'La interfaz es fácil de aprender',
    200: 'Existe soporte profesional disponible',
    201: 'La comunidad responde con rapidez',
    210: 'El personal recibe formación suficiente',
  },
  dimensiones: [
    {
      id: 1,
      nombre: 'Tecnológica',
      factores: [
        {
          id: 10,
          nombre: 'Compatibilidad',
          alcance: 'Externo',
          orden: 1,
          idsSubfactores: [100, 101],
        },
        { id: 11, nombre: 'Usabilidad', alcance: 'Externo', orden: 2, idsSubfactores: [110] },
      ],
    },
    {
      id: 2,
      nombre: 'Organizacional',
      factores: [
        { id: 20, nombre: 'Soporte', alcance: 'Ambos', orden: 1, idsSubfactores: [200, 201] },
        { id: 21, nombre: 'Formación', alcance: 'Interno', orden: 2, idsSubfactores: [210] },
      ],
    },
  ],
};

export const calculoPrueba: CalculoImportancia = {
  id: 1,
  nombre: 'Cálculo inicial de la tesis',
  rango: 'RSL de la tesis',
  fecha: '2022-06-01T12:00:00Z',
  bases: 'IEEE, ACM, Scopus, WoS',
  porFactor: {
    10: { ie: 3, il: 3, is: 3 },
    11: { ie: 3, il: 2, is: 2 },
    20: { ie: 3, il: 4, is: 3 },
    21: { ie: 3, il: 4, is: 3 },
  },
};

export const evaluacionVaciaPrueba: EvaluacionDetalle = {
  id: 7,
  estado: 'en_curso',
  fecha: '2026-10-08T15:00:00Z',
  recomendacion: null,
  idCalculo: 1,
  contexto: {
    titulo: '',
    software: { id: null, nombre: '', version: '', licencia: '' },
    organizacion: { id: null, nombre: '', sector: '', pais: '' },
  },
  valoraciones: [],
};

export const resumenPrueba = (parcial: Partial<ResumenEvaluacion> = {}): ResumenEvaluacion => ({
  id: 1,
  titulo: 'Plataforma de aprendizaje',
  estado: 'en_curso',
  codigo: null,
  fecha: '2026-10-08T15:00:00Z',
  software: { nombre: 'Moodle', version: '4.4', licencia: 'GPL v3' },
  organizacion: 'Universidad Estatal de Milagro',
  factoresValorados: [],
  ...parcial,
});

/** Repositorio simulado con las respuestas por defecto de los datos de prueba. */
export function crearRepositorioFalso(): Repositorio {
  return {
    leerCatalogo: vi.fn(),
    leerCalculoVigente: vi.fn(),
    leerCalculo: vi.fn(),
    listarEvaluaciones: vi.fn(),
    crearBorrador: vi.fn(),
    leerEvaluacion: vi.fn(),
    guardarContexto: vi.fn(),
    guardarValoracionFactor: vi.fn(),
    guardarValoracionSubfactor: vi.fn(),
    finalizarEvaluacion: vi.fn(),
    eliminarEvaluacion: vi.fn(),
  };
}

/** Restablece las respuestas por defecto (llamar en `beforeEach`). */
export function restablecerRepositorioFalso(repo: Repositorio): void {
  for (const funcion of Object.values(repo)) vi.mocked(funcion).mockReset();
  vi.mocked(repo.leerCatalogo).mockResolvedValue(catalogoPrueba);
  vi.mocked(repo.leerCalculoVigente).mockResolvedValue(calculoPrueba);
  vi.mocked(repo.leerCalculo).mockResolvedValue(calculoPrueba);
  vi.mocked(repo.listarEvaluaciones).mockResolvedValue([]);
  vi.mocked(repo.crearBorrador).mockResolvedValue(7);
  vi.mocked(repo.leerEvaluacion).mockResolvedValue(evaluacionVaciaPrueba);
  vi.mocked(repo.guardarContexto).mockImplementation((_id, contexto) => Promise.resolve(contexto));
  vi.mocked(repo.guardarValoracionFactor).mockResolvedValue(undefined);
  vi.mocked(repo.guardarValoracionSubfactor).mockResolvedValue(undefined);
  vi.mocked(repo.finalizarEvaluacion).mockResolvedValue(undefined);
  vi.mocked(repo.eliminarEvaluacion).mockResolvedValue(undefined);
}
