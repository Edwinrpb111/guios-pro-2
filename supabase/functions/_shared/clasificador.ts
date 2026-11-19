// Clasificador con IA (BRIEF §13.3). La IA no busca: solo decide si un candidato que ya trajo
// una API bibliográfica trata el subfactor. Así no se inventan referencias (§13.5).
import {
  ErrorPasoSinTiempo,
  ErrorProveedorNoDisponible,
  MENSAJE_IA_TARDO,
  ErrorRespuestaInvalida,
} from './errores.ts';
import { esErrorDeTiempo, type PresupuestoPaso, senalDe } from './presupuesto.ts';
import { armarPrompt, INSTRUCCION_SISTEMA, leerVeredictos, VERSION_PROMPT } from './prompt.ts';
import { leerEsperaSugerida, type RitmoDeLlamadas } from './ritmo.ts';
import type { Candidato, Clasificador, MedicionLlamada, Veredicto } from './tipos.ts';
import { leerUsoGemini } from './uso_tokens.ts';

export { VERSION_PROMPT };

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
/**
 * Tiempo propio de cada llamada a la IA (issue #45); el paso entero tiene además su tope de 110 s
 * (issue #43). Pasado ese tiempo la llamada se corta y el paso se pausa con un mensaje claro.
 */
const TIEMPO_MAXIMO_MS = 45_000;

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

/** Largo máximo de la evidencia: columna `evidencia varchar(500)` (issue #46). */
export const EVIDENCIA_MAXIMA = 500;

// Caracteres de control (C0, DEL y C1): Postgres no admite U+0000 en texto y el resto no aporta.
const CARACTERES_DE_CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

// Sustituto alto o bajo sin su pareja: Postgres lo rechaza (también dentro de un `jsonb`).
const SUSTITUTO_SUELTO = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

/**
 * Deja un texto externo listo para una columna `varchar(maximo)`: reemplaza los caracteres de
 * control por `reemplazo`, quita los sustitutos sueltos, recorta y lo limita a `maximo` caracteres
 * sin partir un par sustituto (emoji). Puede devolver una cadena vacía.
 */
export function limpiarTexto(texto: string, maximo: number, reemplazo = ' '): string {
  const limpio = texto
    .replace(CARACTERES_DE_CONTROL, reemplazo)
    .replace(SUSTITUTO_SUELTO, '')
    .trim();
  let corto = limpio.slice(0, maximo);
  // Un corte en medio de un par sustituto (emoji) deja una mitad inválida: se descarta.
  if (corto.length < limpio.length && /[\ud800-\udbff]$/.test(corto)) corto = corto.slice(0, -1);
  return corto.trimEnd();
}

/**
 * Deja la evidencia lista para guardar. Es texto de la IA sobre títulos y resúmenes ajenos, o sea
 * NO confiable (issue #46): se trata solo como texto plano (nunca se interpreta), se le quitan los
 * caracteres de control y los sustitutos sueltos, se recorta y se limita a 500 caracteres sin
 * partir un par sustituto. Vacía o no textual queda en `null`. Nunca se escribe en los registros.
 */
export function limpiarEvidencia(evidencia: unknown): string | null {
  if (typeof evidencia !== 'string') return null;
  const corta = limpiarTexto(evidencia, EVIDENCIA_MAXIMA);
  return corta === '' ? null : corta;
}

/** La columna `confianza` es 0..1: acota lo que devuelva la IA; si no es un número, `null`. */
function acotarConfianza(confianza: number): number | null {
  return Number.isFinite(confianza) ? Math.min(1, Math.max(0, confianza)) : null;
}

/** Un candidato que la IA clasificó, con su veredicto ya saneado (issue #46). */
export interface Clasificado {
  candidato: Candidato;
  confianza: number | null;
  evidencia: string | null;
}

/**
 * Reparte los candidatos que la IA clasificó (issue #46):
 * - aceptados: `trata_subfactor` y `confianza >= umbral`;
 * - rechazados: la IA los clasificó pero `trata_subfactor` es falso o la confianza no llega al
 *   umbral (o no es un número).
 * Todo `indice` que no exista en la lista (1..n) se descarta (ni aceptado ni rechazado), y un
 * candidato cuenta una sola vez: manda el primer veredicto. Un candidato sin veredicto no se
 * clasificó, así que tampoco es rechazado. El orden es el de los veredictos.
 */
export function repartirVeredictos(
  candidatos: Candidato[],
  veredictos: Veredicto[],
  umbral: number,
): { aceptados: Clasificado[]; rechazados: Clasificado[] } {
  const vistos = new Set<number>();
  const aceptados: Clasificado[] = [];
  const rechazados: Clasificado[] = [];
  for (const v of veredictos) {
    const candidato = Number.isInteger(v.indice) ? candidatos[v.indice - 1] : undefined;
    if (candidato === undefined || vistos.has(v.indice)) continue;
    vistos.add(v.indice);
    const clasificado: Clasificado = {
      candidato,
      confianza: acotarConfianza(v.confianza),
      evidencia: limpiarEvidencia(v.evidencia),
    };
    const acepta = v.trata_subfactor && Number.isFinite(v.confianza) && v.confianza >= umbral;
    (acepta ? aceptados : rechazados).push(clasificado);
  }
  return { aceptados, rechazados };
}

/**
 * Candidatos que se aceptan: `trata_subfactor` y `confianza >= umbral`. Todo `indice` que no
 * exista en la lista (1..n) se descarta, y un candidato no se acepta dos veces.
 */
export function aceptarVeredictos(
  candidatos: Candidato[],
  veredictos: Veredicto[],
  umbral: number,
): Candidato[] {
  return repartirVeredictos(candidatos, veredictos, umbral).aceptados.map((a) => a.candidato);
}

export class GeminiClasificador implements Clasificador {
  readonly #apiKey: string;
  readonly #modelo: string;
  readonly #fetch: typeof fetch;
  readonly #ritmo: RitmoDeLlamadas | undefined;
  readonly #presupuesto: PresupuestoPaso | undefined;
  readonly #desactivarRazonamiento: boolean;

  /**
   * Con `ritmo` el clasificador espera antes de cada llamada para respetar el límite por minuto
   * y reintenta un 429/503 unas veces (issue #39). Sin `ritmo` no espera ni reintenta. Con
   * `presupuesto`, cada llamada dura como máximo lo que queda del paso (issue #43). Con
   * `desactivarRazonamiento` pide `thinkingBudget: 0` (issue #45; los modelos que no admiten
   * desactivar el razonamiento responden con un error 400).
   */
  constructor(opciones: {
    apiKey: string;
    modelo: string;
    fetch?: typeof fetch;
    ritmo?: RitmoDeLlamadas;
    presupuesto?: PresupuestoPaso;
    desactivarRazonamiento?: boolean;
  }) {
    this.#apiKey = opciones.apiKey;
    this.#modelo = opciones.modelo;
    this.#fetch = opciones.fetch ?? fetch;
    this.#ritmo = opciones.ritmo;
    this.#presupuesto = opciones.presupuesto;
    this.#desactivarRazonamiento = opciones.desactivarRazonamiento ?? false;
  }

  /** Reintentos acumulados en este paso, para que el registro los reparta por lote. */
  get reintentos(): number {
    return this.#ritmo?.reintentos ?? 0;
  }

  async clasificar(
    factor: string,
    subfactor: string,
    contexto: string,
    candidatos: Candidato[],
    medicion?: MedicionLlamada,
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
        ...(this.#desactivarRazonamiento ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
      },
    });

    let respuesta: Response;
    let cuerpo: unknown;
    for (let intento = 0; ; intento++) {
      if (medicion !== undefined) medicion.reintentos = intento;
      // Cada llamada, también un reintento, respeta el ritmo configurado.
      await this.#ritmo?.esperarTurno();
      const { signal, porPresupuesto } = senalDe(this.#presupuesto, TIEMPO_MAXIMO_MS);
      try {
        respuesta = await this.#fetch(`${URL_BASE}/${this.#modelo}:generateContent`, {
          method: 'POST',
          // La clave va en cabecera, no en la dirección, para que no aparezca en registros.
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.#apiKey },
          body: cuerpoPeticion,
          signal,
        });
      } catch (error) {
        // Si la señal la acotó el tope del paso, no es un fallo de red: se pausa por tiempo.
        if (porPresupuesto && esErrorDeTiempo(error)) throw new ErrorPasoSinTiempo();
        // Pasaron los 45 s propios de la llamada: no es un problema de conexión.
        if (esErrorDeTiempo(error)) throw new ErrorProveedorNoDisponible(MENSAJE_IA_TARDO);
        throw new ErrorProveedorNoDisponible(
          'No se pudo conectar con Gemini. Revisa la conexión y reanuda el cálculo.',
        );
      }
      cuerpo = await respuesta.json().catch(() => null);
      if (porPresupuesto && signal.aborted) throw new ErrorPasoSinTiempo();
      if (signal.aborted) throw new ErrorProveedorNoDisponible(MENSAJE_IA_TARDO);

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
        respuesta.status === 429 || respuesta.status === 503 ? 'reintento_agotado' : 'error',
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
        'clave_rechazada',
      );
    }
    if (medicion !== undefined && respuesta.ok) Object.assign(medicion, leerUsoGemini(cuerpo));
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
