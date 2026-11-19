// Clasificador con IA (BRIEF §13.3). La IA no busca: solo decide si un candidato que ya trajo
// una API bibliográfica trata el subfactor. Así no se inventan referencias (§13.5).
import { ErrorProveedorNoDisponible, ErrorRespuestaInvalida } from './errores.ts';
import { armarPrompt, INSTRUCCION_SISTEMA, leerVeredictos, VERSION_PROMPT } from './prompt.ts';
import { leerEsperaSugerida, type RitmoDeLlamadas } from './ritmo.ts';
import type { Candidato, Clasificador, Veredicto } from './tipos.ts';

export { VERSION_PROMPT };

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIEMPO_MAXIMO_MS = 60_000;

const ESQUEMA_RESPUESTA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      indice: { type: 'INTEGER' },
      trata_subfactor: { type: 'BOOLEAN' },
      confianza: { type: 'NUMBER' },
      evidencia: { type: 'STRING' },
    },
    required: ['indice', 'trata_subfactor', 'confianza', 'evidencia'],
  },
};

/**
 * Candidatos que se aceptan: `trata_subfactor` y `confianza >= umbral`. Todo `indice` que no
 * exista en la lista (1..n) se descarta, y un candidato no se acepta dos veces.
 */
export function aceptarVeredictos(
  candidatos: Candidato[],
  veredictos: Veredicto[],
  umbral: number,
): Candidato[] {
  const vistos = new Set<number>();
  const aceptados: Candidato[] = [];
  for (const v of veredictos) {
    const candidato = Number.isInteger(v.indice) ? candidatos[v.indice - 1] : undefined;
    if (candidato === undefined || vistos.has(v.indice)) continue;
    vistos.add(v.indice);
    if (v.trata_subfactor && Number.isFinite(v.confianza) && v.confianza >= umbral) {
      aceptados.push(candidato);
    }
  }
  return aceptados;
}

export class GeminiClasificador implements Clasificador {
  readonly #apiKey: string;
  readonly #modelo: string;
  readonly #fetch: typeof fetch;
  readonly #ritmo: RitmoDeLlamadas | undefined;

  /**
   * Con `ritmo` el clasificador espera antes de cada llamada para respetar el límite por minuto
   * y reintenta un 429/503 unas veces (issue #39). Sin `ritmo` no espera ni reintenta.
   */
  constructor(opciones: {
    apiKey: string;
    modelo: string;
    fetch?: typeof fetch;
    ritmo?: RitmoDeLlamadas;
  }) {
    this.#apiKey = opciones.apiKey;
    this.#modelo = opciones.modelo;
    this.#fetch = opciones.fetch ?? fetch;
    this.#ritmo = opciones.ritmo;
  }

  async clasificar(
    factor: string,
    subfactor: string,
    contexto: string,
    candidatos: Candidato[],
  ): Promise<Veredicto[]> {
    const cuerpoPeticion = JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCCION_SISTEMA }] },
      contents: [
        {
          role: 'user',
          parts: [{ text: armarPrompt(factor, subfactor, contexto, candidatos) }],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: ESQUEMA_RESPUESTA,
      },
    });

    let respuesta: Response;
    let cuerpo: unknown;
    for (let intento = 0; ; intento++) {
      // Cada llamada, también un reintento, respeta el ritmo configurado.
      await this.#ritmo?.esperarTurno();
      try {
        respuesta = await this.#fetch(`${URL_BASE}/${this.#modelo}:generateContent`, {
          method: 'POST',
          // La clave va en cabecera, no en la dirección, para que no aparezca en registros.
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.#apiKey },
          body: cuerpoPeticion,
          signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
        });
      } catch {
        throw new ErrorProveedorNoDisponible(
          'No se pudo conectar con Gemini. Revisa la conexión y reanuda el cálculo.',
        );
      }
      cuerpo = await respuesta.json().catch(() => null);

      // Solo el límite por minuto (429) y la saturación (503) se reintentan; si se agotan los
      // reintentos o el tiempo del paso, sigue el camino de siempre: pausar el cálculo.
      const reintentable = respuesta.status === 429 || respuesta.status === 503;
      if (
        !reintentable ||
        this.#ritmo === undefined ||
        !(await this.#ritmo.esperarReintento(intento, leerEsperaSugerida(cuerpo)))
      ) {
        break;
      }
    }

    if (respuesta.status === 429 || respuesta.status >= 500) {
      throw new ErrorProveedorNoDisponible(
        'Gemini no está disponible o alcanzó su cuota. Reanuda el cálculo más tarde.',
      );
    }
    const mensajeApi = String(
      (cuerpo as { error?: { message?: unknown } } | null)?.error?.message ?? '',
    );
    if (
      respuesta.status === 401 ||
      respuesta.status === 403 ||
      (respuesta.status === 400 && /api key/i.test(mensajeApi))
    ) {
      throw new ErrorProveedorNoDisponible(
        'Gemini rechazó la clave. Revisa el secreto GEMINI_API_KEY y reanuda el cálculo.',
      );
    }
    if (!respuesta.ok) {
      throw new ErrorRespuestaInvalida(`Gemini rechazó la petición (HTTP ${respuesta.status}).`);
    }
    if (cuerpo === null) {
      throw new ErrorRespuestaInvalida('Gemini devolvió una respuesta que no es JSON.');
    }

    const partes = (cuerpo as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] })
      .candidates?.[0]?.content?.parts;
    const texto = partes
      ?.map((parte) => (typeof parte.text === 'string' ? parte.text : ''))
      .join('');
    if (!texto) {
      throw new ErrorRespuestaInvalida('Gemini no devolvió una clasificación para este lote.');
    }

    let interpretado: unknown;
    try {
      interpretado = JSON.parse(texto);
    } catch {
      throw new ErrorRespuestaInvalida('Gemini devolvió una clasificación que no es JSON.');
    }
    if (!Array.isArray(interpretado)) {
      throw new ErrorRespuestaInvalida('Gemini devolvió una clasificación con formato inesperado.');
    }
    return leerVeredictos(interpretado);
  }
}
