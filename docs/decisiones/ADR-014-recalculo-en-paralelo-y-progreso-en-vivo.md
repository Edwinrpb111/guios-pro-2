# ADR-014: Recálculo más rápido (tandas en paralelo, sin razonamiento) y progreso en vivo

- **Estado**: aceptada
- **Fecha**: 23/11/2026
- **Issues**: #45

## Contexto

Con OpenRouter y `deepseek/deepseek-v4.1-flash` (cálculo 5, máx. 50 candidatos) cada paso tardaba de 40 a 67 s: cinco tandas de 10 candidatos **en serie**, de 2 a 22 s cada una, más 4 s de ritmo entre una y otra. Además la pantalla no mostraba nada hasta terminar el paso: la barra no avanzaba, el paso en curso enseñaba el mensaje provisional del registro (ADR-013) como si fuera un error y había que pulsar «Actualizar».

Mandar todo en un solo prompt no ayuda: la salida del modelo se genera en serie, así que una tanda con 5 veces más candidatos tarda unas 5 veces más. Lo que sí ayuda es **dividir y paralelizar**, y que el modelo no gaste tokens «pensando» cuando solo debe clasificar. Mover el recálculo al navegador sigue descartado (expone la clave, BRIEF §14, y el límite lo pone el proveedor).

## Decisión

### Servidor

- **Tandas en paralelo dentro del paso** (`buscarYClasificar`, `busqueda.ts`). Un paso reparte sus candidatos en tandas de 10 (`TAMANO_LOTE`) y manda a la IA hasta `llamadas_simultaneas` a la vez (1..10, **5 por defecto**), con un grupo de trabajadores que toma la siguiente tanda al terminar la suya. Se sigue buscando en serie (Crossref lo pide, BRIEF §13.3).
  - Las referencias aceptadas se guardan **en el orden de las tandas**, no en el de llegada: el resultado es el mismo que en serie (RNF-09) y por eso estos parámetros **no** se guardan en `parametros` del cálculo; se leen en cada paso, como `llamadas_por_minuto`.
  - Si una tanda falla no se lanza ninguna más, se espera a las que ya iban en vuelo (están acotadas por los 45 s por llamada y por el tope del paso, así que quedan anotadas en el registro) y se devuelve el **primer** error. Nada parcial se guarda: el paso sigue siendo reanudable e idempotente.
  - **El ritmo por minuto es de todo el paso**, no de cada tanda (`RitmoDeLlamadas`, ADR-011): los turnos se atienden de uno en uno, separados al menos `60000 / llamadas_por_minuto` ms. Con 15 por minuto las 5 tandas arrancan con 4 s de diferencia; con 120 por minuto, con 0,5 s. Paralelizar no permite saltarse el límite del proveedor.
  - **Reintentos 429/503** y **tope de 110 s** de ADR-013 siguen igual para cada tanda. Las esperas de reintento simultáneas cuentan **una sola vez** en el tope de 90 s de espera (se mide tiempo de pared, no la suma), y siguen limitadas por el tiempo que queda del paso.
- **Desactivar el razonamiento** (`desactivar_razonamiento`, por defecto `false`). Lo que se manda depende del proveedor, y **con un host desconocido no se manda nada** (un parámetro de más puede hacer que el proveedor rechace la petición):

  | Proveedor                                      | Parámetro                                           |
  | ---------------------------------------------- | --------------------------------------------------- |
  | Gemini                                         | `generationConfig.thinkingConfig.thinkingBudget: 0` |
  | Compatible con OpenAI, host `openrouter.ai`    | `reasoning: { enabled: false }`                     |
  | Compatible con OpenAI, host `api.deepseek.com` | `thinking: { type: "disabled" }`                    |
  | Cualquier otro host                            | nada                                                |

  El host se compara completo (`openrouter.ai.otro.example` no es OpenRouter). Límites conocidos: algunos modelos no admiten apagar el razonamiento (p. ej. Gemini Pro responde 400 con `thinkingBudget: 0`; el paso se pausa con «El proveedor rechazó la petición»); en ese caso hay que dejar la opción apagada. Otros proveedores (Groq, OpenAI, Mistral) se pueden añadir a `parametrosSinRazonamiento` cuando se confirme su parámetro.

- **Prioridad de la configuración**: lo guardado en la app (columna no nula) manda; si es `NULL`, la variable de entorno `LLM_LLAMADAS_SIMULTANEAS` / `LLM_DESACTIVAR_RAZONAMIENTO` (`true` o `false`, sin distinguir mayúsculas); si tampoco está, **5** y **`false`**. Un valor fuera de 1..10, no entero, o distinto de `true`/`false` da 500 `configuracion_invalida` con el nombre de la variable. `false` en la base manda sobre un `true` del entorno. Migración aditiva `20261123100000_recalculo_paralelo.sql` (dos columnas nulas, `configuracion_recalculo_servicio()` y el registro de cambios las incluyen).
- **45 s por llamada a la IA** (antes 30 s, ADR-013). Es el tiempo propio de cada `fetch` al clasificador (también si se corta mientras se lee el cuerpo), siempre acotado por lo que queda de los 110 s del paso. Si se cumple el tiempo propio, el paso se pausa con el mensaje exacto **«La IA tardó demasiado en responder.»** (no «No se pudo conectar…»); si lo cortó el tope del paso, sigue el mensaje de `paso_sin_tiempo`. El resultado de la tanda en el registro es `error`. OpenAlex y Crossref siguen en 20 s.
- **Tokens por tanda.** Cada llamada anota en una `MedicionLlamada` propia (no compartida, porque varias corren a la vez) sus reintentos y los tokens del `usage` del proveedor, **tal como los informa**: Gemini `promptTokenCount`, `candidatesTokenCount` (sin el razonamiento) y `thoughtsTokenCount`; compatibles `prompt_tokens`, `completion_tokens` (suele **incluir** el razonamiento) y `completion_tokens_details.reasoning_tokens`. Solo se aceptan enteros no negativos; lo demás queda en `null`. Sirve para ver si la lentitud viene de los tokens de salida o del razonamiento.

### Progreso en vivo: contrato del registro

`recalculo_paso.registro` (ADR-013) gana campos. **Se actualiza durante el paso**: al empezar, tras terminar la búsqueda, tras cada tanda y antes de guardar las referencias. Las escrituras se encadenan para que lleguen en orden y una falla al escribir se anota en el log del servidor sin tumbar el paso. Lo lee `src/admin/registro.ts` (lectura defensiva: todo puede faltar en un registro anterior a #45).

| Campo                         | Significado                                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `etapa`                       | `'buscando'` \| `'clasificando'` \| `'guardando'` mientras el paso corre; **`null` cuando terminó** (bien, pausado o con error). Los registros anteriores no la traen. |
| `lotes_total`                 | Tandas planificadas; **`null` hasta que termina la búsqueda** y también si la búsqueda falló. `0` si no hubo candidatos.                                               |
| `lotes[]`                     | Tandas **ya terminadas, en el orden en que terminaron** (con varias a la vez no es el orden de `n`).                                                                   |
| `lotes[].n`                   | Número de tanda dentro del paso, desde 1 (orden de los candidatos).                                                                                                    |
| `lotes[].tamano`              | Candidatos de la tanda (hasta 10).                                                                                                                                     |
| `lotes[].ms`                  | Milisegundos de la tanda, **incluida** la espera del turno de ritmo y los reintentos.                                                                                  |
| `lotes[].reintentos`          | Reintentos 429/503 de esa tanda.                                                                                                                                       |
| `lotes[].resultado`           | `ok`, `reintento_agotado`, `sin_tiempo`, `clave_rechazada`, `sin_saldo`, `respuesta_invalida` o `error`.                                                               |
| `lotes[].aceptados`           | Referencias aceptadas en la tanda.                                                                                                                                     |
| `lotes[].tokens_entrada`      | Entero o `null`: tokens de entrada que informó el proveedor.                                                                                                           |
| `lotes[].tokens_salida`       | Entero o `null`: tokens de salida que informó el proveedor (ver arriba cómo cuenta cada uno el razonamiento).                                                          |
| `lotes[].tokens_razonamiento` | Entero o `null`: tokens de razonamiento, si el proveedor los informa.                                                                                                  |

El resto (`intento`, `proveedor`, `busqueda[]`, `aceptados`, `resultado`, `mensaje`) no cambia. Mientras el paso corre, `resultado` es `'error'` y `mensaje` el provisional «El paso no terminó…» (así, si la plataforma lo corta, queda un rastro correcto); `aceptados` vale 0 hasta el registro final. **La pantalla ignora ese mensaje mientras haya `etapa`** y muestra la etapa en su lugar. Sigue valiendo: nunca hay claves, direcciones, prompts ni textos de candidatos.

### Pantalla (issue #45, S16e–h)

Consola en tiempo real con lectura del registro cada 2 s y sin botón «Actualizar», barra por subfactores con el subfactor actual y el tiempo restante, el paso en curso sin el mensaje provisional como error y los dos campos nuevos en «Configuración del recálculo» («Llamadas simultáneas» y «Desactivar razonamiento»). Se describe en `docs/recalculo.md`. Fuera de alcance: mover el cálculo al navegador y procesar varios subfactores a la vez.

## Consecuencias

- Un paso de 5 tandas debería pasar de la suma de las tandas a aproximadamente la más lenta más los turnos de ritmo (≈ 4 × 4 s con 15 por minuto; ≈ 2 s con 120). Con el plan gratis de Gemini (15 por minuto) la ganancia es menor: el límite del proveedor manda.
- Más tandas a la vez consumen cuota más rápido: con un 429 la espera y los reintentos aplican a cada tanda, y el ritmo por minuto se comparte. Si el proveedor limita las llamadas concurrentes, bajar `llamadas_simultaneas`.
- El registro del paso ahora se escribe varias veces por intento (≈ 2 + número de tandas): una escritura pequeña por `update`, solo con `service_role`.
- Si la plataforma corta el paso, el registro conserva lo avanzado (tandas hechas, `etapa` sin `null`) y `duracion_ms` nula: se distingue de un paso en curso porque ya no hay actividad (lo decide la pantalla).
- La opción de razonamiento es de mejor esfuerzo: depende de que el proveedor reconozca el parámetro. Con un host desconocido no hace nada, a propósito.
- Pruebas: `configuracion.test.ts`, `paralelo.test.ts`, `llamada_ia.test.ts`, `progreso_vivo.test.ts` y `tope_paso.test.ts` (Deno, con relojes y `fetch` falsos) y `supabase/tests/` (pgTAP) para la migración.
