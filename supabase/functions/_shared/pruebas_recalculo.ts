// Repositorio en memoria y dependencias falsas para probar los manejadores sin base de datos.
import type { Configuracion } from './configuracion.ts';
import type { Dependencias } from './dependencias.ts';
import type {
  Calculo,
  EstadoCalculo,
  EstadoPaso,
  NuevaReferencia,
  NuevoCalculo,
  Paso,
  Repositorio,
  SubfactorCatalogo,
} from './repositorio.ts';
import type { Clasificador, ProveedorBusqueda } from './tipos.ts';
import {
  candidato,
  CATALOGO_PRUEBA,
  clasificadorGuionado,
  CONTEXTO_PRUEBA,
  proveedorFijo,
  verificadorFalso,
} from './pruebas.ts';

export interface CalculoGuardado extends Calculo {
  anio_inicio: number;
  anio_fin: number;
  bases_datos: string;
  creado_por: string;
  mensaje_error: string | null;
}

export interface PasoGuardado {
  estado: EstadoPaso;
  candidatos: number;
  detalle: string | null;
}

export interface ReferenciaGuardada extends NuevaReferencia {
  id_calculo: number;
  id_subfactor: number;
}

export class RepositorioMemoria implements Repositorio {
  readonly calculos = new Map<number, CalculoGuardado>();
  readonly pasos = new Map<number, Map<number, PasoGuardado>>();
  readonly referencias: ReferenciaGuardada[] = [];
  /** Simula una caída de la base al crear los pasos. */
  fallarAlCrearPasos = false;
  #siguiente = 1;

  constructor(readonly subfactores: SubfactorCatalogo[] = CATALOGO_PRUEBA) {}

  catalogo(): Promise<SubfactorCatalogo[]> {
    return Promise.resolve([...this.subfactores]);
  }

  crearCalculo(datos: NuevoCalculo): Promise<number> {
    const id = this.#siguiente++;
    this.calculos.set(id, {
      id_calculo: id,
      origen: 'ia',
      estado: 'en_proceso',
      progreso: 0,
      parametros: datos.parametros,
      anio_inicio: datos.anio_inicio,
      anio_fin: datos.anio_fin,
      bases_datos: datos.bases_datos,
      creado_por: datos.creado_por,
      mensaje_error: null,
    });
    return Promise.resolve(id);
  }

  crearPasos(idCalculo: number, idsSubfactor: number[]): Promise<void> {
    if (this.fallarAlCrearPasos) return Promise.reject(new Error('base caída'));
    const pasos = new Map<number, PasoGuardado>();
    for (const id of idsSubfactor)
      pasos.set(id, { estado: 'pendiente', candidatos: 0, detalle: null });
    this.pasos.set(idCalculo, pasos);
    return Promise.resolve();
  }

  obtenerCalculo(idCalculo: number): Promise<Calculo | null> {
    const calculo = this.calculos.get(idCalculo);
    return Promise.resolve(calculo === undefined ? null : { ...calculo });
  }

  actualizarCalculo(
    idCalculo: number,
    cambios: { estado?: EstadoCalculo; progreso?: number; mensaje_error?: string | null },
  ): Promise<void> {
    const calculo = this.calculos.get(idCalculo);
    if (calculo === undefined) return Promise.reject(new Error('no existe'));
    Object.assign(calculo, cambios);
    return Promise.resolve();
  }

  listarPasos(idCalculo: number): Promise<Paso[]> {
    const pasos = [...(this.pasos.get(idCalculo) ?? [])].map(([id_subfactor, p]) => ({
      id_subfactor,
      estado: p.estado,
    }));
    return Promise.resolve(pasos);
  }

  completarPaso(
    idCalculo: number,
    idSubfactor: number,
    referencias: NuevaReferencia[],
    candidatos: number,
  ): Promise<void> {
    for (const r of referencias) {
      const repetida = this.referencias.some(
        (x) => x.id_calculo === idCalculo && x.id_subfactor === idSubfactor && x.doi === r.doi,
      );
      if (!repetida)
        this.referencias.push({ ...r, id_calculo: idCalculo, id_subfactor: idSubfactor });
    }
    this.pasos.get(idCalculo)?.set(idSubfactor, { estado: 'hecho', candidatos, detalle: null });
    return Promise.resolve();
  }

  marcarPasoConError(idCalculo: number, idSubfactor: number, detalle: string): Promise<void> {
    this.pasos.get(idCalculo)?.set(idSubfactor, { estado: 'error', candidatos: 0, detalle });
    return Promise.resolve();
  }

  /** Referencias de un subfactor, para las aserciones. */
  doisDe(idCalculo: number, idSubfactor: number): string[] {
    return this.referencias
      .filter((r) => r.id_calculo === idCalculo && r.id_subfactor === idSubfactor)
      .map((r) => r.doi);
  }
}

export const CONFIGURACION_PRUEBA: Configuracion = {
  proveedorLlm: 'fake',
  modelo: 'fake',
  umbral: 0.7,
  maxCandidatos: 50,
  openalexApiKey: undefined,
  crossrefMailto: undefined,
  geminiApiKey: undefined,
};

/** Cada subfactor trae 3 candidatos con DOI propios de la consulta (se aceptan todos por defecto). */
export function proveedorPorConsulta(nombre: 'openalex' | 'crossref'): ProveedorBusqueda {
  return {
    nombre,
    buscar(consulta) {
      const huella = [...consulta].reduce((suma, c) => (suma * 31 + c.charCodeAt(0)) % 100000, 7);
      return Promise.resolve(
        [1, 2, 3].map((k) =>
          candidato(k, { doi: `10.1000/${nombre}.${huella}.${k}`, base: nombre }),
        ),
      );
    },
  };
}

export function crearDependenciasPrueba(
  cambios: Omit<Partial<Dependencias>, 'repositorio'> & { repositorio?: RepositorioMemoria } = {},
): Dependencias & { repositorio: RepositorioMemoria } {
  const clasificador: Clasificador = clasificadorGuionado();
  return {
    verificador: verificadorFalso,
    repositorio: new RepositorioMemoria(),
    contexto: CONTEXTO_PRUEBA,
    configuracion: CONFIGURACION_PRUEBA,
    proveedores: (fuentes) => fuentes.map((f) => proveedorPorConsulta(f)),
    clasificador: () => clasificador,
    ...cambios,
  } as Dependencias & { repositorio: RepositorioMemoria };
}

export { proveedorFijo };
