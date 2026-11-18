// Proveedor y clasificador falsos (BRIEF §13.4, §13.6): se eligen con `LLM_PROVIDER=fake`.
// Funcionan sin red ni cuota y siempre dan el mismo resultado: son el modo de las pruebas, del
// CI y de la demostración.
import type { Candidato, Clasificador, NombreBase, ProveedorBusqueda, Veredicto } from './tipos.ts';

/** FNV-1a de 32 bits: simple, estable entre ejecuciones y sin dependencias. */
function hash(texto: string): number {
  let valor = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    valor ^= texto.charCodeAt(i);
    valor = Math.imul(valor, 0x01000193) >>> 0;
  }
  return valor;
}

export class ProveedorFalso implements ProveedorBusqueda {
  readonly nombre: NombreBase;
  readonly #grabados: Candidato[] | undefined;

  /** Con `grabados` devuelve siempre esa lista; sin ella, inventa candidatos a partir de la consulta. */
  constructor(nombre: NombreBase, grabados?: Candidato[]) {
    this.nombre = nombre;
    this.#grabados = grabados;
  }

  buscar(
    consulta: string,
    anioInicio: number,
    anioFin: number,
    limite: number,
  ): Promise<Candidato[]> {
    if (this.#grabados !== undefined) return Promise.resolve(this.#grabados.slice(0, limite));

    const semilla = hash(`${this.nombre}|${consulta}`);
    const cantidad = Math.min(limite, 5 + (semilla % 16));
    const anios = Math.max(anioFin - anioInicio + 1, 1);
    const huella = semilla.toString(16).padStart(8, '0');
    const candidatos: Candidato[] = [];
    for (let k = 1; k <= cantidad; k++) {
      candidatos.push({
        titulo: `Estudio simulado ${k} (${this.nombre}) sobre ${consulta.slice(0, 80)}`,
        anio: anioInicio + (hash(`${huella}|${k}`) % anios),
        doi: `10.9999/falso.${this.nombre}.${huella}.${k}`,
        resumen: `Resumen simulado ${k} de un estudio sobre adopción de software libre.`,
        base: this.nombre,
      });
    }
    return Promise.resolve(candidatos);
  }
}

export class ClasificadorFalso implements Clasificador {
  /** Confianza entre 0,50 y 0,99 según el texto: con el umbral por defecto (0,7) acepta cerca del 60 %. */
  clasificar(
    _factor: string,
    subfactor: string,
    _contexto: string,
    candidatos: Candidato[],
  ): Promise<Veredicto[]> {
    return Promise.resolve(
      candidatos.map((c, i) => ({
        indice: i + 1,
        trata_subfactor: true,
        confianza: 0.5 + (hash(`${subfactor}|${c.titulo}`) % 50) / 100,
        evidencia: 'Veredicto simulado (LLM_PROVIDER=fake).',
      })),
    );
  }
}
