# ADR-012: Proveedor del clasificador «compatible con OpenAI»

- **Estado**: aceptada
- **Fecha**: 19/11/2026
- **Issues**: #40

## Contexto

Hasta el issue #39 el clasificador del recálculo solo podía ser **Gemini** o **Falso (demostración)**. El plan gratis de Gemini se agota enseguida y el administrador pidió poder usar otros proveedores baratos sin depender de uno solo. La mayoría de esos servicios (OpenRouter, Groq, DeepSeek, Mistral, Together, OpenAI…) exponen la misma API `POST {dirección base}/chat/completions`, así que un único cliente cubre a todos cambiando solo la dirección base, el modelo y la clave.

## Decisión

- **Un tercer proveedor, `openai`** («Compatible con OpenAI»), además de `gemini` y `fake`, que no cambian. `ClasificadorCompatibleOpenAI` (`supabase/functions/_shared/clasificador_openai.ts`) usa el **mismo prompt, la misma instrucción de sistema y la misma lectura de veredictos** que Gemini (`prompt.ts`): la IA sigue clasificando solo candidatos que ya trajo OpenAlex o Crossref (BRIEF §13.5), así que el resultado no depende del proveedor más que por el modelo.
- **Respuesta tolerante.** No pide `response_format: json_object` (chocaba con el arreglo que pide el prompt: con OpenRouter algunos servidores devolvían un solo veredicto suelto y el resto del lote quedaba rechazado sin clasificar). Si faltan veredictos o la respuesta es ilegible, el lote se pide una vez más y de un JSON cortado se rescatan los veredictos completos. Acepta el arreglo de veredictos suelto, dentro de un objeto, dentro de un bloque de código o tras un bloque `<think>` de modelos de razonamiento. Si no se puede interpretar, es la misma respuesta inválida de siempre.
- **Mismo ritmo y reintentos que Gemini** (ADR-011): espera antes de cada llamada según `llamadas_por_minuto` y reintenta un 429 o 503 hasta 3 veces, usando la cabecera `Retry-After` si viene, con el mismo tope de 90 s por paso. Al agotarse, el cálculo queda `pausado` con `proveedor_no_disponible`. Una clave rechazada (401/403) o sin saldo (402) no se reintenta y da un mensaje claro. Los mensajes no nombran al proveedor ni incluyen la clave ni la dirección.
- **Configuración.** Nueva migración `20261121100000_proveedor_openai.sql`: `proveedor_llm` admite `openai`; columnas `openai_base_url` (https, sin credenciales, parámetros ni fragmento, hasta 200 caracteres) y `openai_modelo` (hasta 150 caracteres, letras, dígitos y `.-_:/@`), ambas con `CHECK`, incluidas en el registro de cambios y en `configuracion_recalculo_servicio()`, y legibles y modificables solo por un administrador (ADR-010). La clave `OPENAI_COMPAT_API_KEY` se guarda en Vault, de solo escritura, como las de Gemini y OpenAlex. Equivalentes de entorno: `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_MODEL` y `OPENAI_COMPAT_API_KEY`; lo guardado en la app manda. La Edge Function valida la dirección y el modelo con las mismas reglas solo cuando el proveedor elegido es `openai`.
- **Pantalla.** En «Configuración del recálculo» aparece la tarjeta «Compatible con OpenAI» con la dirección base, el modelo y la clave en el mismo bloque. El resumen «Qué va a usar el recálculo» muestra el proveedor, el modelo y si la clave está guardada.
- **Cambio de proveedor a mitad de un recálculo.** Igual que entre Gemini y Falso: el siguiente paso responde 409 `proveedor_cambiado`.

## Consecuencias

- Se puede usar cualquier servicio con API compatible sin tocar código: basta con la dirección base (p. ej. `https://openrouter.ai/api/v1`, `https://api.groq.com/openai/v1`, `https://api.deepseek.com/v1`, `https://api.mistral.ai/v1`), el modelo y la clave.
- La calidad de la clasificación depende del modelo elegido: un modelo débil puede devolver JSON inválido o veredictos poco fiables. Conviene probar con un recálculo pequeño (`RECALCULO_MAX_CANDIDATOS=15`).
- Los límites por minuto varían según el servicio: hay que ajustar `llamadas_por_minuto`.
- A cada servicio se le envían solo títulos y resúmenes públicos, como a Gemini.
- Pruebas: `supabase/functions/_shared/proveedor_openai.test.ts` y `configuracion.test.ts` (Deno), `supabase/tests/configuracion.test.sql` (pgTAP), `formularioConfiguracion.test.ts`, `AdminConfiguracionPage.test.tsx`, `AdminNuevoRecalculoPage.test.tsx`, `EstadoClasificador.test.tsx` y `apiSupabase.test.ts` (Vitest).
