// Clasificador «compatible con OpenAI» (issue #40, S14): cualquier servicio que hable el formato
// `POST {urlBase}/chat/completions` (OpenRouter, Groq, DeepSeek, Mistral, Together, OpenAI…).
// Igual que Gemini, la IA solo clasifica candidatos que ya trajo una API bibliográfica (§13.5):
// usa el MISMO prompt, la MISMA instrucción y la MISMA lectura de veredictos (`prompt.ts`).
import {
  ErrorPasoSinTiempo,
  ErrorProveedorNoDisponible,
  ErrorRespuestaInvalida,
} from './errores.ts';
import { esErrorDeTiempo, type PresupuestoPaso, senalDe } from './presupuesto.ts';
import { armarPrompt, INSTRUCCION_SISTEMA, leerVeredictos } from './prompt.ts';
import { leerRetryAfter, type RitmoDeLlamadas } from './ritmo.ts';
import type { Candidato, Clasificador, Veredicto } from './tipos.ts';

/** Tiempo propio de cada llamada; el paso entero tiene además su tope de 110 s (issue #43). */
const TIEMPO_MAXIMO_MS = 30_000;

// Mensajes neutrales: el proveedor lo elige el administrador, no se nombra uno en particular y
// nunca se incluye la clave ni la dirección (podría llevar datos del servicio).
const MENSAJE_NO_DISPONIBLE =
  'El proveedor de IA no está disponible o alcanzó su cuota. Reanuda el cálculo más tarde.';

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
    if (desde !== -1 && hasta > desde) fragmentos.push(limpio.slice(desde, hasta + 1));
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
  return null;
}

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

export class ClasificadorCompatibleOpenAI implements Clasificador {
  readonly #apiKey: string;
  readonly #urlBase: string;
  readonly #modelo: string;
  readonly #fetch: typeof fetch;
  readonly #ritmo: RitmoDeLlamadas | undefined;
  readonly #presupuesto: PresupuestoPaso | undefined;

  /**
   * `urlBase` es la dirección https ya validada (ver `normalizarUrlBase`), p. ej.
   * `https://openrouter.ai/api/v1`. Con `ritmo` espera antes de cada llamada y reintenta un
   * 429/503 unas veces, igual que Gemini (issue #39); sin `ritmo` no espera ni reintenta. Con
   * `presupuesto`, cada llamada dura como máximo lo que queda del paso (issue #43).
   */
  constructor(opciones: {
    apiKey: string;
    urlBase: string;
    modelo: string;
    fetch?: typeof fetch;
    ritmo?: RitmoDeLlamadas;
    presupuesto?: PresupuestoPaso;
  }) {
    this.#apiKey = opciones.apiKey;
    this.#urlBase = opciones.urlBase.replace(/\/+$/, '');
    this.#modelo = opciones.modelo;
    this.#fetch = opciones.fetch ?? fetch;
    this.#ritmo = opciones.ritmo;
    this.#presupuesto = opciones.presupuesto;
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
  ): Promise<Veredicto[]> {
    // El modelo va en el cuerpo (puede llevar «/» y «:»), nunca en la dirección.
    const cuerpoPeticion = JSON.stringify({
      model: this.#modelo,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: INSTRUCCION_SISTEMA },
        { role: 'user', content: armarPrompt(factor, subfactor, contexto, candidatos) },
      ],
    });

    let respuesta: Response;
    let cuerpo: unknown;
    for (let intento = 0; ; intento++) {
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
        if (porPresupuesto && esErrorDeTiempo(error)) throw new ErrorPasoSinTiempo();
        throw new ErrorProveedorNoDisponible(
          'No se pudo conectar con el proveedor de IA. Revisa la dirección base y la conexión, y reanuda el cálculo.',
        );
      }
      cuerpo = await respuesta.json().catch(() => null);
      if (porPresupuesto && signal.aborted) throw new ErrorPasoSinTiempo();

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
    if (!respuesta.ok) {
      throw new ErrorRespuestaInvalida(
        `El proveedor de IA rechazó la petición (HTTP ${respuesta.status}). Revisa la dirección base y el modelo.`,
      );
    }
    if (cuerpo === null) {
      throw new ErrorRespuestaInvalida('El proveedor de IA devolvió una respuesta que no es JSON.');
    }

    const texto = leerTexto(cuerpo);
    if (texto.trim() === '') {
      throw new ErrorRespuestaInvalida(
        'El proveedor de IA no devolvió una clasificación para este lote.',
      );
    }
    const arreglo = extraerArreglo(texto);
    if (arreglo === null) {
      throw new ErrorRespuestaInvalida(
        'El proveedor de IA devolvió una clasificación que no se pudo leer como JSON.',
      );
    }
    return leerVeredictos(arreglo);
  }
}
