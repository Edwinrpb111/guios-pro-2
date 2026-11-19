// Un paso del recálculo (BRIEF §13.2, pasos 3a–3d): arma la consulta, busca en las fuentes,
// normaliza y deduplica por DOI, recorta, clasifica en lotes y devuelve lo aceptado y lo rechazado.
import { type Clasificado, limpiarTexto, repartirVeredictos } from './clasificador.ts';
import { type ContextoSubfactores, contextoDe } from './contexto.ts';
import { normalizarDoi } from './doi.ts';
import { ErrorPasoSinTiempo } from './errores.ts';
import type { PresupuestoPaso } from './presupuesto.ts';
import { type EntradaLote, mensajeSeguro, motivoDe, type RegistradorPaso } from './registro.ts';
import type {
  NuevaReferencia,
  NuevaReferenciaRechazada,
  SubfactorCatalogo,
} from './repositorio.ts';
import type { Candidato, Clasificador, MedicionLlamada, ProveedorBusqueda } from './tipos.ts';

export const TAMANO_LOTE = 10;

const FRASE_BASE = 'open source software adoption FLOSS';
const LARGO_MAXIMO_CONSULTA = 300;
const TITULO_MAXIMO = 500; // columna `referencia.titulo varchar(500)`
const DOI_MAXIMO = 200; // columna `referencia.doi varchar(200)`

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
  /**
   * Los que la IA clasificó y no aceptó, listos para `referencia_rechazada` (issue #46). No
   * incluye lo descartado antes de clasificar (sin DOI o fuera de rango) ni índices inválidos.
   */
  rechazadas: NuevaReferenciaRechazada[];
}

/**
 * Fila lista para guardar: año y forma del DOI ya validados por `depurar`. Título y DOI vienen de
 * las fuentes (texto ajeno): se les quitan caracteres de control y sustitutos sueltos, que
 * Postgres rechaza (tumbarían el paso en cada reintento), y el título se limita a la columna (500)
 * sin partir un par sustituto. En el DOI el carácter inválido se quita (no se cambia por espacio).
 */
function aFila({ candidato, confianza, evidencia }: Clasificado): NuevaReferencia {
  return {
    titulo: limpiarTexto(candidato.titulo, TITULO_MAXIMO),
    anio: candidato.anio as number,
    doi: limpiarTexto(candidato.doi as string, DOI_MAXIMO, ''),
    base_datos: candidato.base,
    confianza,
    evidencia,
  };
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
  /** Tandas que se mandan a la IA a la vez (1..10); sin indicar, una tras otra (issue #45). */
  llamadasSimultaneas?: number;
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
    llamadasSimultaneas = 1,
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

  // Tandas de TAMANO_LOTE candidatos. Hasta `llamadasSimultaneas` van a la IA a la vez (issue #45);
  // el ritmo por minuto lo reparte el clasificador entre todas (`RitmoDeLlamadas`).
  const lotes: Candidato[][] = [];
  for (let i = 0; i < candidatos.length; i += TAMANO_LOTE) {
    lotes.push(candidatos.slice(i, i + TAMANO_LOTE));
  }
  await registro?.clasificando(lotes.length);
  const aceptadosPorLote: Clasificado[][] = lotes.map(() => []);
  const rechazadosPorLote: Clasificado[][] = lotes.map(() => []);
  let siguiente = 0;
  let fallo: { error: unknown } | undefined;

  const clasificarLote = async (indice: number) => {
    const lote = lotes[indice]!;
    const n = indice + 1;
    const desde = ahora();
    // El clasificador anota aquí los reintentos y tokens de ESTA llamada (varias corren a la vez).
    const medicion: MedicionLlamada = {
      reintentos: 0,
      tokensEntrada: null,
      tokensSalida: null,
      tokensRazonamiento: null,
    };
    const anotar = (resultado: EntradaLote['resultado'], aceptadosLote: number): void => {
      registro?.anotarLote({
        n,
        tamano: lote.length,
        ms: ahora() - desde,
        reintentos: medicion.reintentos,
        resultado,
        aceptados: aceptadosLote,
        tokens_entrada: medicion.tokensEntrada,
        tokens_salida: medicion.tokensSalida,
        tokens_razonamiento: medicion.tokensRazonamiento,
      });
      // No se espera: la escritura va en cola y `vaciar()` la espera al final del paso.
      void registro?.publicar();
    };
    try {
      // Con poco tiempo no se empieza el lote: se pausa y se reanuda con todo el tiempo.
      presupuesto?.exigirTiempoParaLote();
      const veredictos = await clasificador.clasificar(
        subfactor.nombre_factor,
        subfactor.enunciado,
        descripcion,
        lote,
        medicion,
      );
      const delLote = repartirVeredictos(lote, veredictos, umbral);
      aceptadosPorLote[indice] = delLote.aceptados;
      rechazadosPorLote[indice] = delLote.rechazados;
      anotar('ok', delLote.aceptados.length);
    } catch (error) {
      anotar(motivoDe(error), 0);
      throw error;
    }
  };

  const trabajador = async () => {
    while (fallo === undefined && siguiente < lotes.length) {
      const indice = siguiente++;
      try {
        await clasificarLote(indice);
      } catch (error) {
        // El primer error manda; las tandas en vuelo terminan y se anotan, pero no se lanzan más.
        fallo ??= { error };
      }
    }
  };
  const trabajadores = Math.max(1, Math.min(llamadasSimultaneas, lotes.length));
  await Promise.all(Array.from({ length: trabajadores }, trabajador));
  if (fallo !== undefined) throw fallo.error;
  await registro?.guardando();

  return {
    candidatos: candidatos.length,
    referencias: aceptadosPorLote.flat().map(aFila),
    rechazadas: rechazadosPorLote.flat().map(aFila),
  };
}
