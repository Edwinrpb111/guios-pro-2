// Proveedor Crossref (BRIEF §13.3). Consultas en serie, como máximo 1 por segundo, y respeta
// las cabeceras `x-rate-limit-*`.
import { normalizarDoi } from './doi.ts';
import { ErrorProveedorNoDisponible, ErrorRespuestaInvalida } from './errores.ts';
import type { Candidato, ProveedorBusqueda } from './tipos.ts';

const URL_BASE = 'https://api.crossref.org/works';
const FILAS_MAXIMO = 50;
const INTERVALO_MINIMO_MS = 1000;
const TIEMPO_MAXIMO_MS = 20_000;

const ENTIDADES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** Crossref entrega el resumen en JATS XML (`<jats:p>…</jats:p>`): se deja solo el texto. */
function limpiarResumen(xml: unknown): string | null {
  if (typeof xml !== 'string') return null;
  const texto = xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (entidad) => ENTIDADES[entidad] ?? entidad)
    .replace(/\s+/g, ' ')
    .trim();
  return texto === '' ? null : texto;
}

/** `x-rate-limit-interval: 3s` con `x-rate-limit-limit: 1` equivale a 3000 ms entre consultas. */
function intervaloDeCabeceras(cabeceras: Headers): number {
  const limite = Number(cabeceras.get('x-rate-limit-limit'));
  const segundos = /^(\d+(?:\.\d+)?)s$/.exec(cabeceras.get('x-rate-limit-interval') ?? '')?.[1];
  if (!(limite > 0) || segundos === undefined) return INTERVALO_MINIMO_MS;
  return Math.max(INTERVALO_MINIMO_MS, Math.ceil((Number(segundos) * 1000) / limite));
}

interface ObraCrossref {
  DOI?: unknown;
  title?: unknown;
  issued?: { 'date-parts'?: unknown } | null;
  abstract?: unknown;
}

export class CrossrefProveedor implements ProveedorBusqueda {
  readonly nombre = 'crossref' as const;
  readonly #mailto: string | undefined;
  readonly #fetch: typeof fetch;
  readonly #ahora: () => number;
  readonly #esperar: (ms: number) => Promise<void>;
  #ultimaConsulta: number | null = null;
  #intervaloMs = INTERVALO_MINIMO_MS;

  constructor(
    opciones: {
      mailto?: string;
      fetch?: typeof fetch;
      ahora?: () => number;
      esperar?: (ms: number) => Promise<void>;
    } = {},
  ) {
    this.#mailto = opciones.mailto;
    this.#fetch = opciones.fetch ?? fetch;
    this.#ahora = opciones.ahora ?? Date.now;
    this.#esperar =
      opciones.esperar ?? ((ms) => new Promise((resolver) => setTimeout(resolver, ms)));
  }

  async buscar(
    consulta: string,
    anioInicio: number,
    anioFin: number,
    limite: number,
  ): Promise<Candidato[]> {
    const url = new URL(URL_BASE);
    url.searchParams.set('query.bibliographic', consulta);
    url.searchParams.set(
      'filter',
      `from-pub-date:${anioInicio}-01-01,until-pub-date:${anioFin}-12-31,type:journal-article`,
    );
    url.searchParams.set('rows', String(Math.min(Math.max(limite, 1), FILAS_MAXIMO)));
    url.searchParams.set('select', 'DOI,title,issued,abstract');
    if (this.#mailto) url.searchParams.set('mailto', this.#mailto);

    await this.#respetarLimite();

    let respuesta: Response;
    try {
      respuesta = await this.#fetch(url, { signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS) });
    } catch {
      throw new ErrorProveedorNoDisponible(
        'No se pudo conectar con Crossref. Revisa la conexión y reanuda el cálculo.',
      );
    } finally {
      this.#ultimaConsulta = this.#ahora();
    }
    this.#intervaloMs = intervaloDeCabeceras(respuesta.headers);

    if (respuesta.status === 429 || respuesta.status >= 500) {
      throw new ErrorProveedorNoDisponible(
        'Crossref no está disponible o alcanzó su límite de uso. Reanuda el cálculo más tarde.',
      );
    }
    if (!respuesta.ok) {
      throw new ErrorRespuestaInvalida(`Crossref rechazó la consulta (HTTP ${respuesta.status}).`);
    }

    let cuerpo: unknown;
    try {
      cuerpo = await respuesta.json();
    } catch {
      throw new ErrorRespuestaInvalida('Crossref devolvió una respuesta que no es JSON.');
    }
    const items = (cuerpo as { message?: { items?: unknown } } | null)?.message?.items;
    if (!Array.isArray(items)) {
      throw new ErrorRespuestaInvalida('Crossref devolvió una respuesta sin resultados.');
    }

    const candidatos: Candidato[] = [];
    for (const obra of items as ObraCrossref[]) {
      const titulos = Array.isArray(obra?.title) ? obra.title : [];
      const titulo = typeof titulos[0] === 'string' ? titulos[0].trim() : '';
      if (titulo === '') continue;
      const partes = obra.issued?.['date-parts'];
      const anio = Array.isArray(partes) && Array.isArray(partes[0]) ? partes[0][0] : null;
      candidatos.push({
        titulo,
        anio: Number.isInteger(anio) ? (anio as number) : null,
        doi: normalizarDoi(obra.DOI),
        resumen: limpiarResumen(obra.abstract),
        base: 'crossref',
      });
    }
    return candidatos;
  }

  async #respetarLimite(): Promise<void> {
    if (this.#ultimaConsulta === null) return;
    const espera = this.#intervaloMs - (this.#ahora() - this.#ultimaConsulta);
    if (espera > 0) await this.#esperar(espera);
  }
}
