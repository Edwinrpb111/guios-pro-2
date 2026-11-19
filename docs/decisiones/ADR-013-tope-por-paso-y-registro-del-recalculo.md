# ADR-013: Tope de tiempo por paso y registro del recálculo

- **Estado**: aceptada
- **Fecha**: 22/11/2026
- **Issues**: #43

## Contexto

En producción el recálculo con Gemini avanzaba muy lento y se cortaba con «No se pudo contactar con el servicio de recálculo». El cálculo 4 quedó `en_proceso` con 3 de 61 pasos, sin `mensaje_error` y sin ningún paso en `error`. La causa estaba en el código:

- El tope de 90 s de ADR-011 solo contaba las **esperas** de ritmo y de reintento, no lo que tarda cada llamada. Una llamada a Gemini podía tardar hasta 60 s, un subfactor con 50 candidatos hace 5 lotes y OpenAlex y Crossref suman hasta 40 s más: un paso podía pasar los 150 s de la Edge Function. La plataforma lo corta y **no se guarda nada**; al reanudar se repetía el mismo subfactor lento.
- No quedaba registro: las funciones no dejaban log por paso, `recalculo_paso.detalle` se borra al terminar y la pantalla solo mostraba el porcentaje.

Mover el recálculo al navegador queda descartado: expondría la clave (BRIEF §14) y no sería más rápido, porque el límite lo pone el proveedor de IA.

## Decisión

- **Tope de 110 s por invocación de `recalculo-paso`** (`PresupuestoPaso`, `supabase/functions/_shared/presupuesto.ts`), medido con el reloj inyectable (`ahora`/`esperar` de `Dependencias`) desde que entra la invocación. Cubre búsquedas, llamadas a la IA, esperas de ritmo y reintentos. Deja 40 s de margen sobre los 150 s de la plataforma para guardar. El tope de 90 s de espera de ADR-011 se conserva, pero ya no puede hacer que el paso exceda los 110 s.
- **Cada `fetch`** (OpenAlex, Crossref, Gemini y compatible con OpenAI) usa `AbortSignal.timeout(min(su tiempo propio, tiempo restante))`. El tiempo propio de las llamadas a la IA baja de 60 s a **30 s**; OpenAlex y Crossref siguen en 20 s. Si el aborto lo causó el tope del paso (y no la red), el error es el de tiempo agotado, no «no se pudo conectar».
- **Tiempo mínimo para empezar: 15 s.** No se empieza un lote, ni una espera de ritmo, ni un reintento si tras ello quedarían menos de 15 s: una llamada a la IA puede durar hasta 30 s y es mejor pausar que gastar cuota y que el tope la corte a medias.
- **Al agotarse el tiempo** el cálculo queda `pausado` por el camino de pausa existente, con el código nuevo **`paso_sin_tiempo`** (HTTP 503, `{estado, progreso, pendientes}`) y el mensaje «El subfactor «X» tardó más de lo permitido (110 s). Reduce el máximo de candidatos o sube las llamadas por minuto y reanuda.». El paso sigue `pendiente` y no se guarda nada parcial: es reanudable e idempotente. `proveedor_cambiado` y `calculo_cerrado` no cambian.
- **Registro por paso en la base.** Migración aditiva `20261122100000_registro_recalculo.sql`: tres columnas nulas en `recalculo_paso`:
  - `iniciado_en timestamptz`: se escribe **al empezar** el intento; así un paso que la plataforma cortó sigue mostrando que se inició.
  - `duracion_ms integer` (`>= 0`): se escribe al terminar; queda nula si lo cortaron.
  - `registro jsonb`: el último intento: `{intento, proveedor, busqueda[{fuente, ms, candidatos, error}], lotes[{n, tamano, ms, reintentos, resultado, aceptados}], aceptados, resultado: hecho|pausado|error, mensaje}`. Con `resultado` de lote `ok`, `reintento_agotado`, `sin_tiempo`, `clave_rechazada`, `sin_saldo`, `respuesta_invalida` o `error`.
  - Al empezar se guarda un registro provisional (`resultado: 'error'`, «El paso no terminó…»); si el intento termina, lo reemplaza el registro final. `intento` sube cada vez que se repite el mismo paso.
  - **Nunca** contiene claves, direcciones, prompts ni textos de candidatos: solo conteos, tiempos y mensajes propios de la función. Un fallo inesperado se anota con un mensaje genérico, sin copiar el texto de la excepción.
  - `detalle` conserva su significado (mensaje de un paso en `error`; se borra al completar). Todo lo nuevo va en `registro`.
- **Permisos.** El administrador las lee con la política existente «recalculo: leer admin» (es por fila, cubre las columnas nuevas). Se quitan `insert`, `update` y `delete` de `anon` y `authenticated` sobre `recalculo_paso`: solo `service_role` (la Edge Function) escribe. El decisor no ve ninguna fila.
- **Una línea `console.log` por intento**, en JSON: `{evento, id_calculo, id_subfactor, subfactor, intento, proveedor, resultado, duracion_ms, busqueda[{fuente, ms, candidatos}], candidatos, lotes, aceptados}`. Sin claves, URL ni textos. Se ve en el panel de Supabase (Edge Functions → `recalculo-paso` → Logs).
- **El registro nunca tumba el paso**: si no se puede escribir (o leer el intento anterior), se anota en el log del servidor y el paso sigue.
- Frontend (mensajes reales de corte 504/546, reintento automático del mismo paso hasta 2 veces y panel de registro en P-09): ver `docs/recalculo.md`.

## Consecuencias

- Ningún paso debería superar los 150 s: un subfactor lento se pausa a los 110 s con un mensaje claro en lugar de cortarse sin rastro. Para que un subfactor lento pase hay que bajar `RECALCULO_MAX_CANDIDATOS` (en cálculos nuevos) o subir las llamadas por minuto.
- Un cálculo ya iniciado usa el máximo de candidatos que se guardó en sus parámetros (RNF-09): si un subfactor no cabe en 110 s con ese máximo, hay que iniciar uno nuevo con un máximo menor.
- Si la plataforma corta igualmente un paso (p. ej. por CPU), queda `iniciado_en` con `duracion_ms` nula y el registro provisional: se distingue de un paso nunca intentado.
- El registro guarda solo el **último** intento por subfactor; el historial completo está en los logs de la función.
- Con menos de 4 llamadas por minuto un paso de 5 lotes no cabe en 110 s y se pausa por tiempo (antes, por ritmo): el mensaje indica qué ajustar.
- Pruebas: `presupuesto.test.ts`, `tope_paso.test.ts`, `registro_paso.test.ts` y `supabase_real.test.ts` (Deno, con reloj y `fetch` falsos), `supabase/tests/registro_recalculo.test.sql` (pgTAP).
