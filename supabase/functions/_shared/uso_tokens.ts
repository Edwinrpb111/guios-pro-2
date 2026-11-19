// Tokens de una llamada a la IA, leídos del `usage` que informa el proveedor (issue #45, S16d).
// Solo se aceptan enteros no negativos; lo demás queda en `null`. Se guardan tal como los informa
// cada proveedor: en Gemini la salida NO incluye el razonamiento (`thoughtsTokenCount` va aparte);
// en los compatibles con OpenAI `completion_tokens` suele incluirlo (ADR-014).
import type { MedicionLlamada } from './tipos.ts';

type Tokens = Pick<MedicionLlamada, 'tokensEntrada' | 'tokensSalida' | 'tokensRazonamiento'>;

function entero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 ? valor : null;
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
}

/** `usageMetadata` de Gemini. */
export function leerUsoGemini(cuerpo: unknown): Tokens {
  const uso = objeto(objeto(cuerpo)['usageMetadata']);
  return {
    tokensEntrada: entero(uso['promptTokenCount']),
    tokensSalida: entero(uso['candidatesTokenCount']),
    tokensRazonamiento: entero(uso['thoughtsTokenCount']),
  };
}

/** `usage` de un proveedor compatible con OpenAI. */
export function leerUsoOpenAI(cuerpo: unknown): Tokens {
  const uso = objeto(objeto(cuerpo)['usage']);
  return {
    tokensEntrada: entero(uso['prompt_tokens']),
    tokensSalida: entero(uso['completion_tokens']),
    tokensRazonamiento: entero(objeto(uso['completion_tokens_details'])['reasoning_tokens']),
  };
}
