// Repositorio en memoria y dependencias falsas para probar los manejadores sin base de datos.
import type { Configuracion } from './configuracion.ts';
import type { Dependencias } from './dependencias.ts';
import type { RegistroPaso } from './registro.ts';
import type {
  Calculo,
  EstadoCalculo,
  EstadoPaso,
  NuevaReferencia,
  NuevaReferenciaRechazada,
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
  /** Registro del último intento (issue #43); nulos hasta que el paso se intenta. */
  iniciado_en: string | null;
  duracion_ms: number | null;
  registro: RegistroPaso | null;
}

const SIN_REGISTRO = { iniciado_en: null, duracion_ms: null, registro: null } as const;

export interface ReferenciaGuardada extends NuevaReferencia {
  id_calculo: number;
  id_subfactor: number;
}

export class RepositorioMemoria implements Repositorio {
  readonly calculos = new Map<number, CalculoGuardado>();
  readonly pasos = new Map<number, Map<number, PasoGuardado>>();
  readonly referencias: ReferenciaGuardada[] = [];
  /** Filas de `referencia_rechazada` (issue #46). */
  readonly rechazadas: ReferenciaGuardada[] = [];
  /** Simula una caída de la base al crear el cálculo con sus pasos (no deja nada creado). */
  fallarAlCrear = false;
  #siguiente = 1;

  constructor(readonly subfactores: SubfactorCatalogo[] = CATALOGO_PRUEBA) {}

  catalogo(): Promise<SubfactorCatalogo[]> {
    return Promise.resolve([...this.subfactores]);
  }

  crearCalculoConPasos(datos: NuevoCalculo): Promise<number> {
    if (this.fallarAlCrear) return Promise.reject(new Error('base caída'));
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
    const pasos = new Map<number, PasoGuardado>();
    for (const s of this.subfactores)
      pasos.set(s.id_subfactor, {
        estado: 'pendiente',
        candidatos: 0,
        detalle: null,
        ...SIN_REGISTRO,
      });
    this.pasos.set(id, pasos);
    return Promise.resolve(id);
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
    rechazadas: NuevaReferenciaRechazada[],
    candidatos: number,
  ): Promise<void> {
    // Como el upsert real: la referencia ya guardada actualiza todo, sin duplicar el DOI.
    for (const r of referencias) {
      const fila = { ...r, id_calculo: idCalculo, id_subfactor: idSubfactor };
      const existente = this.referencias.findIndex(
        (x) => x.id_calculo === idCalculo && x.id_subfactor === idSubfactor && x.doi === r.doi,
      );
      if (existente === -1) this.referencias.push(fila);
      else this.referencias[existente] = fila;
    }
    // Los rechazados del subfactor se reemplazan: delete + insert.
    for (let i = this.rechazadas.length - 1; i >= 0; i--) {
      const x = this.rechazadas[i]!;
      if (x.id_calculo === idCalculo && x.id_subfactor === idSubfactor)
        this.rechazadas.splice(i, 1);
    }
    for (const r of rechazadas) {
      this.rechazadas.push({ ...r, id_calculo: idCalculo, id_subfactor: idSubfactor });
    }
    const anterior = this.pasos.get(idCalculo)?.get(idSubfactor);
    this.pasos.get(idCalculo)?.set(idSubfactor, {
      ...SIN_REGISTRO,
      ...anterior,
      estado: 'hecho',
      candidatos,
      detalle: null,
    });
    return Promise.resolve();
  }

  marcarPasoConError(idCalculo: number, idSubfactor: number, detalle: string): Promise<void> {
    const anterior = this.pasos.get(idCalculo)?.get(idSubfactor);
    this.pasos
      .get(idCalculo)
      ?.set(idSubfactor, { ...SIN_REGISTRO, ...anterior, estado: 'error', candidatos: 0, detalle });
    return Promise.resolve();
  }

  intentosDelPaso(idCalculo: number, idSubfactor: number): Promise<number> {
    return Promise.resolve(this.pasos.get(idCalculo)?.get(idSubfactor)?.registro?.intento ?? 0);
  }

  guardarRegistroPaso(
    idCalculo: number,
    idSubfactor: number,
    datos: { iniciado_en?: string; duracion_ms: number | null; registro: RegistroPaso },
  ): Promise<void> {
    const fila = this.pasos.get(idCalculo)?.get(idSubfactor);
    if (fila === undefined) return Promise.reject(new Error('no existe el paso'));
    if (datos.iniciado_en !== undefined) fila.iniciado_en = datos.iniciado_en;
    fila.duracion_ms = datos.duracion_ms;
    fila.registro = datos.registro;
    return Promise.resolve();
  }

  /** Rechazados de un subfactor, para las aserciones. */
  rechazadasDe(idCalculo: number, idSubfactor: number): ReferenciaGuardada[] {
    return this.rechazadas.filter(
      (r) => r.id_calculo === idCalculo && r.id_subfactor === idSubfactor,
    );
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
  llamadasPorMinuto: 15,
  llamadasSimultaneas: 5,
  desactivarRazonamiento: false,
  openalexApiKey: undefined,
  crossrefMailto: undefined,
  geminiApiKey: undefined,
  openaiBaseUrl: undefined,
  openaiModelo: undefined,
  openaiApiKey: undefined,
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
    ahora: () => 0,
    esperar: () => Promise.resolve(),
    proveedores: (fuentes) => fuentes.map((f) => proveedorPorConsulta(f)),
    clasificador: () => clasificador,
    ...cambios,
  } as Dependencias & { repositorio: RepositorioMemoria };
}

export { proveedorFijo };
