// Clasificador «compatible con OpenAI» (issue #40, S14): cualquier servicio que hable el formato
// `POST {urlBase}/chat/completions` (OpenRouter, Groq, DeepSeek, Mistral, Together, OpenAI…).
// Igual que Gemini, la IA solo clasifica candidatos que ya trajo una API bibliográfica (§13.5):
// usa el MISMO prompt, la MISMA instrucción y la MISMA lectura de veredictos (`prompt.ts`).
import {
  ErrorPasoSinTiempo,
  ErrorProveedorNoDisponible,
  ErrorRespuestaInvalida,
  MENSAJE_IA_TARDO,
} from './errores.ts';
import { esErrorDeTiempo, type PresupuestoPaso, senalDe } from './presupuesto.ts';
import { armarPrompt, INSTRUCCION_SISTEMA, leerVeredictos } from './prompt.ts';
import { leerRetryAfter, type RitmoDeLlamadas } from './ritmo.ts';
import type { Candidato, Clasificador, MedicionLlamada, Veredicto } from './tipos.ts';
import { leerUsoOpenAI } from './uso_tokens.ts';

/**
 * Tiempo propio de cada llamada a la IA (issue #45); el paso entero tiene además su tope de 110 s
 * (issue #43). Pasado ese tiempo la llamada se corta y el paso se pausa con un mensaje claro.
 */
const TIEMPO_MAXIMO_MS = 45_000;

// Mensajes neutrales: el proveedor lo elige el administrador, no se nombra uno en particular y
// nunca se incluye la clave ni la dirección (podría llevar datos del servicio).
const MENSAJE_NO_DISPONIBLE =
  'El proveedor de IA no está disponible o alcanzó su cuota. Reanuda el cálculo más tarde.';

/**
 * Parámetros que desactivan el razonamiento en los proveedores que se conocen (issue #45). Cada
 * uno usa el suyo; con un host desconocido no se manda NADA (un parámetro de más puede hacer que
 * el proveedor rechace la petición). El host se compara completo: `openrouter.ai.otro.example`
 * no es OpenRouter.
 */
export function parametrosSinRazonamiento(urlBase: string): Record<string, unknown> {
  let host: string;
  try {
    host = new URL(urlBase).hostname.toLowerCase();
  } catch {
    return {};
  }
  if (host === 'openrouter.ai') return { reasoning: { enabled: false } };
  if (host === 'api.deepseek.com') return { thinking: { type: 'disabled' } };
  return {};
}

/**
 * Los modelos suelen envolver el JSON en un bloque de código o en texto, y con
 * `response_format: json_object` deben devolver un objeto en lugar de un arreglo. Devuelve el
 * arreglo de veredictos crudos del primer fragmento que se pueda interpretar, o `null`.
 */
function extraerArreglo(texto: string): unknown[] | null {
  // Los modelos de razonamiento a veces dejan su pensamiento en el mismo texto.
  const limpio = texto.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fragmentos = [limpio];
  for (const bloque of limpio.matchAll(/```[A-Za-z]*[ \t]*\r?\n?([\s\S]*?)```/g)) {
    fragmentos.push((bloque[1] ?? '').trim());
  }
  for (const [abre, cierra] of [
    ['[', ']'],
    ['{', '}'],
  ] as const) {
    const desde = limpio.indexOf(abre);
    const hasta = limpio.lastIndexOf(cierra);
    if (desde !== -1 && hasta > desde) {
      fragmentos.push(limpio.slice(desde, hasta + 1));
    }
  }

  for (const fragmento of fragmentos) {
    let valor: unknown;
    try {
      valor = JSON.parse(fragmento);
    } catch {
      continue;
    }
    if (Array.isArray(valor)) return valor;
    if (valor !== null && typeof valor === 'object') {
      // `{"resultados": [...]}` y similares: el primer arreglo del objeto.
      const arreglo = Object.values(valor).find(Array.isArray);
      if (arreglo !== undefined) return arreglo;
      // Un único veredicto suelto.
      if ('indice' in valor) return [valor];
    }
  }

  // JSON cortado (p. ej. por el límite de tokens) o con basura entre medio: se rescatan los
  // veredictos que sí llegaron completos, objeto por objeto (no tienen objetos anidados).
  const rescatados: unknown[] = [];
  for (const objeto of limpio.matchAll(/\{[^{}]*\}/g)) {
    try {
      const valor: unknown = JSON.parse(objeto[0]);
      if (valor !== null && typeof valor === 'object' && 'indice' in valor) {
        rescatados.push(valor);
      }
    } catch {
      // Ese fragmento no se puede leer: se sigue con el resto.
    }
  }
  return rescatados.length > 0 ? rescatados : null;
}

/** `finish_reason` de la primera opción (`length` = se cortó por el límite de tokens). */
function leerFinRazon(cuerpo: unknown): string | null {
  const razon = (cuerpo as { choices?: { finish_reason?: unknown }[] } | null)?.choices?.[0]
    ?.finish_reason;
  return typeof razon === 'string' ? razon : null;
}

/** Candidatos distintos (índices 1..total) que recibieron veredicto. */
function cubiertos(veredictos: Veredicto[], total: number): number {
  return new Set(
    veredictos.map((v) => v.indice).filter((i) => Number.isInteger(i) && i >= 1 && i <= total),
  ).size;
}

/** Suma dos conteos de tokens; `null` solo si faltan los dos. */
function sumar(a: number | null, b: number | null): number | null {
  return a === null ? b : b === null ? a : a + b;
}

/** Largo máximo del texto ilegible que se deja en los registros del servidor. */
const MUESTRA_MAXIMA = 300;

/** Texto del primer mensaje del asistente (cadena o lista de partes de texto). */
function leerTexto(cuerpo: unknown): string {
  const contenido = (cuerpo as { choices?: { message?: { content?: unknown } }[] } | null)
    ?.choices?.[0]?.message?.content;
  if (typeof contenido === 'string') return contenido;
  if (!Array.isArray(contenido)) return '';
  return contenido
    .map((parte: unknown) => {
      if (typeof parte === 'string') return parte;
      const texto = (parte as { text?: unknown } | null)?.text;
      return typeof texto === 'string' ? texto : '';
    })
    .join('');
}

/** Respuesta 200 sin clasificación legible: la única que se vuelve a pedir. */
class ErrorRespuestaIlegible extends ErrorRespuestaInvalida {}

export class ClasificadorCompatibleOpenAI implements Clasificador {
  readonly #apiKey: string;
  readonly #urlBase: string;
  readonly #modelo: string;
  readonly #fetch: typeof fetch;
  readonly #ritmo: RitmoDeLlamadas | undefined;
  readonly #presupuesto: PresupuestoPaso | undefined;
  readonly #desactivarRazonamiento: boolean;

  /**
   * `urlBase` es la dirección https ya validada (ver `normalizarUrlBase`), p. ej.
   * `https://openrouter.ai/api/v1`. Con `ritmo` espera antes de cada llamada y reintenta un
   * 429/503 unas veces, igual que Gemini (issue #39); sin `ritmo` no espera ni reintenta. Con
   * `presupuesto`, cada llamada dura como máximo lo que queda del paso (issue #43). Con
   * `desactivarRazonamiento` manda el parámetro propio del proveedor, si se conoce (issue #45).
   */
  constructor(opciones: {
    apiKey: string;
    urlBase: string;
    modelo: string;
    fetch?: typeof fetch;
    ritmo?: RitmoDeLlamadas;
    presupuesto?: PresupuestoPaso;
    desactivarRazonamiento?: boolean;
  }) {
    this.#apiKey = opciones.apiKey;
    this.#urlBase = opciones.urlBase.replace(/\/+$/, '');
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

  /**
   * Clasifica el lote. Si la IA devuelve una clasificación vacía o ilegible, o sin un veredicto por candidato (pasa con modelos que
   * razonan de más, cortan la respuesta o devuelven un solo objeto), se pide UNA vez más antes de fallar; ese segundo pedido
   * cuenta como reintento del lote y sus tokens se suman.
   */
  async clasificar(
    factor: string,
    subfactor: string,
    contexto: string,
    candidatos: Candidato[],
    medicion?: MedicionLlamada,
  ): Promise<Veredicto[]> {
    let mejor: Veredicto[] | null = null;
    for (let ronda = 0; ; ronda++) {
      const parcial: MedicionLlamada = {
        reintentos: 0,
        tokensEntrada: null,
        tokensSalida: null,
        tokensRazonamiento: null,
      };
      try {
        const veredictos = await this.#clasificarUnaVez(
          factor,
          subfactor,
          contexto,
          candidatos,
          parcial,
        );
        const total = candidatos.length;
        if (mejor === null || cubiertos(veredictos, total) > cubiertos(mejor, total)) {
          mejor = veredictos;
        }
        // Un candidato sin veredicto quedaría rechazado sin que la IA lo haya clasificado.
        if (cubiertos(mejor, total) === total || ronda >= 1) {
          if (cubiertos(mejor, total) < total) {
            console.error(
              JSON.stringify({
                evento: 'clasificacion_incompleta',
                modelo: this.#modelo,
                candidatos: total,
                veredictos: cubiertos(mejor, total),
              }),
            );
          }
          return mejor;
        }
      } catch (error) {
        if (!(error instanceof ErrorRespuestaIlegible) || ronda >= 1) {
          // La primera ronda trajo algo y la segunda no: mejor lo que ya había que nada.
          if (mejor !== null && error instanceof ErrorRespuestaIlegible) return mejor;
          throw error;
        }
      } finally {
        if (medicion !== undefined) {
          medicion.reintentos = (ronda === 0 ? 0 : medicion.reintentos + 1) + parcial.reintentos;
          medicion.tokensEntrada = sumar(
            ronda === 0 ? null : medicion.tokensEntrada,
            parcial.tokensEntrada,
          );
          medicion.tokensSalida = sumar(
            ronda === 0 ? null : medicion.tokensSalida,
            parcial.tokensSalida,
          );
          medicion.tokensRazonamiento = sumar(
            ronda === 0 ? null : medicion.tokensRazonamiento,
            parcial.tokensRazonamiento,
          );
        }
      }
    }
  }

  async #clasificarUnaVez(
    factor: string,
    subfactor: string,
    contexto: string,
    candidatos: Candidato[],
    medicion: MedicionLlamada,
  ): Promise<Veredicto[]> {
    // El modelo va en el cuerpo (puede llevar «/» y «:»), nunca en la dirección.
    const cuerpoPeticion = JSON.stringify({
      model: this.#modelo,
      temperature: 0,
      ...(this.#desactivarRazonamiento ? parametrosSinRazonamiento(this.#urlBase) : {}),
      messages: [
        { role: 'system', content: INSTRUCCION_SISTEMA },
        {
          role: 'user',
          content: armarPrompt(factor, subfactor, contexto, candidatos),
        },
      ],
    });

    let respuesta: Response;
    let cuerpo: unknown;
    for (let intento = 0; ; intento++) {
      medicion.reintentos = intento;
      // Cada llamada, también un reintento, respeta el ritmo configurado.
      await this.#ritmo?.esperarTurno();
      const { signal, porPresupuesto } = senalDe(this.#presupuesto, TIEMPO_MAXIMO_MS);
      try {
        respuesta = await this.#fetch(`${this.#urlBase}/chat/completions`, {
          method: 'POST',
          // La clave va en cabecera, no en la dirección, para que no aparezca en registros.
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.#apiKey}`,
          },
          body: cuerpoPeticion,
          // Una redirección podría llevar la clave a otro servidor: se trata como fallo de conexión.
          redirect: 'error',
          signal,
        });
      } catch (error) {
        // Si la señal la acotó el tope del paso, no es un fallo de red: se pausa por tiempo.
        if (porPresupuesto && esErrorDeTiempo(error)) {
          throw new ErrorPasoSinTiempo();
        }
        // Pasaron los 45 s propios de la llamada: no es un problema de conexión.
        if (esErrorDeTiempo(error)) {
          throw new ErrorProveedorNoDisponible(MENSAJE_IA_TARDO);
        }
        throw new ErrorProveedorNoDisponible(
          'No se pudo conectar con el proveedor de IA. Revisa la dirección base y la conexión, y reanuda el cálculo.',
        );
      }
      cuerpo = await respuesta.json().catch(() => null);
      if (porPresupuesto && signal.aborted) throw new ErrorPasoSinTiempo();
      if (signal.aborted) {
        throw new ErrorProveedorNoDisponible(MENSAJE_IA_TARDO);
      }

      // Solo el límite por minuto (429) y la saturación (503) se reintentan, esperando lo que
      // pida `Retry-After` (en segundos); si se agotan los reintentos o el tiempo del paso, el
      // cálculo se pausa como siempre.
      const reintentable = respuesta.status === 429 || respuesta.status === 503;
      if (
        !reintentable ||
        this.#ritmo === undefined ||
        !(await this.#ritmo.esperarReintento(
          intento,
          leerRetryAfter(respuesta.headers.get('retry-after')),
        ))
      ) {
        break;
      }
    }

    if (respuesta.status === 429 || respuesta.status >= 500) {
      throw new ErrorProveedorNoDisponible(
        MENSAJE_NO_DISPONIBLE,
        respuesta.status === 429 || respuesta.status === 503 ? 'reintento_agotado' : 'error',
      );
    }
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new ErrorProveedorNoDisponible(
        'El proveedor de IA rechazó la clave. Revisa la clave OPENAI_COMPAT_API_KEY y reanuda el cálculo.',
        'clave_rechazada',
      );
    }
    if (respuesta.status === 402) {
      throw new ErrorProveedorNoDisponible(
        'El proveedor de IA rechazó la petición por falta de saldo o créditos. Revisa tu cuenta y reanuda el cálculo.',
        'sin_saldo',
      );
    }
    if (respuesta.ok) Object.assign(medicion, leerUsoOpenAI(cuerpo));
    if (!respuesta.ok) {
      throw new ErrorRespuestaInvalida(
        `El proveedor de IA rechazó la petición (HTTP ${respuesta.status}). Revisa la dirección base y el modelo.`,
      );
    }
    if (cuerpo === null) {
      throw new ErrorRespuestaInvalida('El proveedor de IA devolvió una respuesta que no es JSON.');
    }

    const texto = leerTexto(cuerpo);
    const arreglo = texto.trim() === '' ? null : extraerArreglo(texto);
    if (arreglo === null) {
      const finRazon = leerFinRazon(cuerpo);
      // Para diagnosticar, en los registros del servidor (nunca en el registro del paso): un
      // recorte del texto recibido. No lleva la clave ni la dirección.
      console.error(
        JSON.stringify({
          evento: 'clasificacion_ilegible',
          modelo: this.#modelo,
          fin: finRazon,
          largo: texto.length,
          muestra: texto.slice(0, MUESTRA_MAXIMA),
        }),
      );
      const cortada =
        finRazon === 'length'
          ? ' La respuesta se cortó por el límite de tokens del modelo (suele pasar cuando razona de más).'
          : '';
      throw new ErrorRespuestaIlegible(
        (texto.trim() === ''
          ? 'El proveedor de IA no devolvió una clasificación para este lote.'
          : 'El proveedor de IA devolvió una clasificación que no se pudo leer como JSON.') +
          cortada,
      );
    }
    return leerVeredictos(arreglo);
  }
}
