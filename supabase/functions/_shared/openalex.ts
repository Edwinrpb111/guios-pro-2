// Proveedor OpenAlex (BRIEF §13.3).
import { normalizarDoi } from './doi.ts';
import {
  ErrorPasoSinTiempo,
  ErrorProveedorNoDisponible,
  ErrorRespuestaInvalida,
} from './errores.ts';
import { esErrorDeTiempo, type PresupuestoPaso, senalDe } from './presupuesto.ts';
import type { Candidato, ProveedorBusqueda } from './tipos.ts';

const URL_BASE = 'https://api.openalex.org/works';
const POR_PAGINA_MAXIMO = 100;
const TIEMPO_MAXIMO_MS = 20_000;

interface ObraOpenAlex {
  title?: unknown;
  doi?: unknown;
  publication_year?: unknown;
  abstract_inverted_index?: unknown;
}

/** OpenAlex entrega el resumen como índice invertido `palabra -> posiciones`. */
export function reconstruirResumen(indice: unknown): string | null {
  if (indice === null || typeof indice !== 'object') return null;
  const palabras: string[] = [];
  for (const [palabra, posiciones] of Object.entries(indice)) {
    if (!Array.isArray(posiciones)) continue;
    for (const posicion of posiciones) {
      if (Number.isInteger(posicion) && posicion >= 0) palabras[posicion] = palabra;
    }
  }
  const texto = palabras.filter((palabra) => palabra !== undefined).join(' ');
  return texto === '' ? null : texto;
}

export class OpenAlexProveedor implements ProveedorBusqueda {
  readonly nombre = 'openalex' as const;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #presupuesto: PresupuestoPaso | undefined;

  /** Con `presupuesto`, la consulta dura como máximo lo que queda del paso (issue #43). */
  constructor(opciones: { apiKey: string; fetch?: typeof fetch; presupuesto?: PresupuestoPaso }) {
    this.#apiKey = opciones.apiKey;
    this.#fetch = opciones.fetch ?? fetch;
    this.#presupuesto = opciones.presupuesto;
  }

  async buscar(
    consulta: string,
    anioInicio: number,
    anioFin: number,
    limite: number,
  ): Promise<Candidato[]> {
    const url = new URL(URL_BASE);
    url.searchParams.set('search', consulta);
    url.searchParams.set(
      'filter',
      `publication_year:${anioInicio}-${anioFin},type:article,has_doi:true`,
    );
    url.searchParams.set('per_page', String(Math.min(Math.max(limite, 1), POR_PAGINA_MAXIMO)));
    url.searchParams.set('select', 'id,doi,title,publication_year,abstract_inverted_index');
    url.searchParams.set('api_key', this.#apiKey);

    const { signal, porPresupuesto } = senalDe(this.#presupuesto, TIEMPO_MAXIMO_MS);
    let respuesta: Response;
    try {
      respuesta = await this.#fetch(url, { signal });
    } catch (error) {
      if (porPresupuesto && esErrorDeTiempo(error)) throw new ErrorPasoSinTiempo();
      // No se reenvía el error original: su texto puede incluir la dirección con la clave.
      throw new ErrorProveedorNoDisponible(
        'No se pudo conectar con OpenAlex. Revisa la conexión y reanuda el cálculo.',
      );
    }

    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new ErrorProveedorNoDisponible(
        'OpenAlex rechazó la clave. Revisa el secreto OPENALEX_API_KEY y reanuda el cálculo.',
      );
    }
    if (respuesta.status === 429 || respuesta.status >= 500) {
      throw new ErrorProveedorNoDisponible(
        'OpenAlex no está disponible o alcanzó su límite de uso. Reanuda el cálculo más tarde.',
      );
    }
    if (!respuesta.ok) {
      throw new ErrorRespuestaInvalida(`OpenAlex rechazó la consulta (HTTP ${respuesta.status}).`);
    }

    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch {
      if (porPresupuesto && signal.aborted) throw new ErrorPasoSinTiempo();
      throw new ErrorRespuestaInvalida('OpenAlex devolvió una respuesta que no es JSON.');
    }
    const resultados = (cuerpo as { results?: unknown } | null)?.results;
    if (!Array.isArray(resultados)) {
      throw new ErrorRespuestaInvalida('OpenAlex devolvió una respuesta sin resultados.');
    }

    const candidatos: Candidato[] = [];
    for (const obra of resultados as ObraOpenAlex[]) {
      const titulo = typeof obra?.title === 'string' ? obra.title.trim() : '';
      if (titulo === '') continue;
      candidatos.push({
        titulo,
        anio: Number.isInteger(obra.publication_year) ? (obra.publication_year as number) : null,
        doi: normalizarDoi(obra.doi),
        resumen: reconstruirResumen(obra.abstract_inverted_index),
        base: 'openalex',
      });
    }
    return candidatos;
  }
}
