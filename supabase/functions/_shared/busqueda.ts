// Un paso del recálculo (BRIEF §13.2, pasos 3a–3d): arma la consulta, busca en las fuentes,
// normaliza y deduplica por DOI, recorta, clasifica en lotes y devuelve lo aceptado.
import { aceptarVeredictos } from './clasificador.ts';
import { type ContextoSubfactores, contextoDe } from './contexto.ts';
import { normalizarDoi } from './doi.ts';
import { ErrorPasoSinTiempo } from './errores.ts';
import type { PresupuestoPaso } from './presupuesto.ts';
import { type EntradaLote, mensajeSeguro, motivoDe, type RegistradorPaso } from './registro.ts';
import type { NuevaReferencia, SubfactorCatalogo } from './repositorio.ts';
import type { Candidato, Clasificador, ProveedorBusqueda } from './tipos.ts';

export const TAMANO_LOTE = 10;

const FRASE_BASE = 'open source software adoption FLOSS';
const LARGO_MAXIMO_CONSULTA = 300;
const TITULO_MAXIMO = 500; // columna `referencia.titulo varchar(500)`

/** (open source software adoption / FLOSS adoption) + factor + términos del subfactor. */
export function armarConsulta(terminosFactor: string[], terminosSubfactor: string[]): string {
  const consulta = [FRASE_BASE, ...terminosFactor.slice(0, 2), ...terminosSubfactor.slice(0, 3)]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return consulta.length <= LARGO_MAXIMO_CONSULTA
    ? consulta
    : consulta.slice(0, LARGO_MAXIMO_CONSULTA).replace(/\s+\S*$/, '');
}

/** Intercala las listas (una de cada fuente por turno) para que el recorte reparta entre fuentes. */
function intercalar(listas: Candidato[][]): Candidato[] {
  const resultado: Candidato[] = [];
  const largo = Math.max(0, ...listas.map((lista) => lista.length));
  for (let i = 0; i < largo; i++) {
    for (const lista of listas) {
      const candidato = lista[i];
      if (candidato !== undefined) resultado.push(candidato);
    }
  }
  return resultado;
}

/**
 * Solo quedan los candidatos con DOI válido y año dentro del rango (la tabla `referencia` exige
 * ambos), sin repetir DOI. Si un duplicado trae el resumen que le faltaba al primero, se conserva.
 */
function depurar(candidatos: Candidato[], anioInicio: number, anioFin: number): Candidato[] {
  const porDoi = new Map<string, Candidato>();
  for (const candidato of candidatos) {
    const doi = normalizarDoi(candidato.doi);
    if (doi === null || candidato.anio === null) continue;
    if (
      !Number.isInteger(candidato.anio) ||
      candidato.anio < anioInicio ||
      candidato.anio > anioFin
    ) {
      continue;
    }
    const existente = porDoi.get(doi);
    if (existente === undefined) {
      porDoi.set(doi, { ...candidato, doi });
    } else if (existente.resumen === null && candidato.resumen !== null) {
      existente.resumen = candidato.resumen;
    }
  }
  return [...porDoi.values()];
}

export interface ResultadoBusqueda {
  /** Candidatos con DOI que llegaron al clasificador. */
  candidatos: number;
  /** Los aceptados, listos para guardar en `referencia`. */
  referencias: NuevaReferencia[];
}

export async function buscarYClasificar(entrada: {
  subfactor: SubfactorCatalogo;
  contexto: ContextoSubfactores;
  proveedores: ProveedorBusqueda[];
  clasificador: Clasificador;
  anioInicio: number;
  anioFin: number;
  umbral: number;
  maxCandidatos: number;
  /** Tope de tiempo del paso (110 s): sin tiempo no se busca ni se empieza un lote (issue #43). */
  presupuesto?: PresupuestoPaso;
  /** Si se da, anota cada búsqueda y cada lote (tiempos, conteos y motivo), sin textos. */
  registro?: RegistradorPaso;
}): Promise<ResultadoBusqueda> {
  const {
    subfactor,
    proveedores,
    clasificador,
    anioInicio,
    anioFin,
    umbral,
    maxCandidatos,
    presupuesto,
    registro,
  } = entrada;
  const ahora = presupuesto?.ahora.bind(presupuesto) ?? Date.now;
  const { terminosFactor, terminosSubfactor, descripcion } = contextoDe(
    entrada.contexto,
    subfactor,
  );
  const consulta = armarConsulta(terminosFactor, terminosSubfactor);

  // En serie, como pide Crossref (BRIEF §13.3).
  const listas: Candidato[][] = [];
  for (const proveedor of proveedores) {
    const desde = ahora();
    try {
      if (presupuesto !== undefined && presupuesto.restante() <= 0) throw new ErrorPasoSinTiempo();
      const lista = await proveedor.buscar(consulta, anioInicio, anioFin, maxCandidatos);
      listas.push(lista);
      registro?.anotarBusqueda({
        fuente: proveedor.nombre,
        ms: ahora() - desde,
        candidatos: lista.length,
        error: null,
      });
    } catch (error) {
      registro?.anotarBusqueda({
        fuente: proveedor.nombre,
        ms: ahora() - desde,
        candidatos: 0,
        error: mensajeSeguro(error),
      });
      throw error;
    }
  }
  const candidatos = depurar(intercalar(listas), anioInicio, anioFin).slice(0, maxCandidatos);

  const aceptados: Candidato[] = [];
  for (let i = 0; i < candidatos.length; i += TAMANO_LOTE) {
    const lote = candidatos.slice(i, i + TAMANO_LOTE);
    const n = i / TAMANO_LOTE + 1;
    const desde = ahora();
    const reintentosAntes = clasificador.reintentos ?? 0;
    const anotar = (resultado: EntradaLote['resultado'], aceptadosLote: number) =>
      registro?.anotarLote({
        n,
        tamano: lote.length,
        ms: ahora() - desde,
        reintentos: (clasificador.reintentos ?? 0) - reintentosAntes,
        resultado,
        aceptados: aceptadosLote,
      });
    try {
      // Con poco tiempo no se empieza el lote: se pausa y se reanuda con todo el tiempo.
      presupuesto?.exigirTiempoParaLote();
      const veredictos = await clasificador.clasificar(
        subfactor.nombre_factor,
        subfactor.enunciado,
        descripcion,
        lote,
      );
      const delLote = aceptarVeredictos(lote, veredictos, umbral);
      aceptados.push(...delLote);
      anotar('ok', delLote.length);
    } catch (error) {
      anotar(motivoDe(error), 0);
      throw error;
    }
  }

  return {
    candidatos: candidatos.length,
    referencias: aceptados.map((c) => ({
      titulo: c.titulo.slice(0, TITULO_MAXIMO),
      anio: c.anio as number,
      doi: c.doi as string,
      base_datos: c.base,
    })),
  };
}
