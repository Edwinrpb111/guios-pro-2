# ADR-011: Ritmo de llamadas a Gemini y reintento ante 429/503

- **Estado**: aceptada
- **Fecha**: 19/11/2026
- **Issues**: #39

## Contexto

Con el plan gratis de Gemini el límite por minuto es corto (el administrador midió 18 en Google AI Studio y se gastaban «de una»). El recálculo lo agotaba en segundos: `useRecalculo` invoca `recalculo-paso` una vez tras otra sin pausa y cada paso llama al clasificador una vez por lote de 10 candidatos (hasta 5 llamadas seguidas con 50 candidatos). Gemini respondía 429 y, según BRIEF §13.5, el cálculo quedaba `pausado`. El administrador eligió que el recálculo **espere y reintente solo**, con un ritmo configurable, para que funcione con el plan gratis y con el de pago.

## Decisión

- **El ritmo se controla dentro de la Edge Function**, no en el navegador. `RitmoDeLlamadas` (`supabase/functions/_shared/ritmo.ts`) espera antes de **cada** llamada a Gemini (también la primera de un paso y cada reintento) lo necesario para que dos llamadas queden separadas al menos `60000 / llamadas_por_minuto` ms. El navegador invoca los pasos estrictamente en serie, así que esperar antes de cada llamada garantiza el espaciado también entre pasos; dentro de una invocación se recuerda la hora de la última llamada para no esperar de más. Como una invocación nueva no sabe cuándo fue la última llamada del paso anterior, la primera espera el intervalo completo (4 s con 15 por minuto): se paga unos segundos por paso a cambio de no depender de estado compartido entre invocaciones.
- **Reintento solo de 429 y 503.** `GeminiClasificador` espera el `retryDelay` del cuerpo del error (`google.rpc.RetryInfo`, p. ej. `"17s"`) o, si no viene, 5 s, 10 s y 20 s; cada espera se limita a 30 s; hasta 3 reintentos; y la espera total de un paso (ritmo y reintentos) no pasa de 90 s, para quedar bien por debajo de los 150 s de una Edge Function. Si un reintento ya no cabe en ese presupuesto, o se agotan los 3, se lanza el mismo `ErrorProveedorNoDisponible` de siempre: el cálculo queda `pausado` con el mismo mensaje y código (`proveedor_no_disponible`) y reanudar continúa desde el mismo paso. Los demás 5xx, la caída de red, los tiempos agotados, la clave rechazada y las respuestas inválidas **no se reintentan** (comportamiento anterior).
- **Reloj inyectable.** `Dependencias` incluye `ahora()` y `esperar(ms)`; las pruebas usan un reloj falso y nunca duermen de verdad. El clasificador falso (`LLM_PROVIDER=fake`) no recibe ritmo y no espera.
- **Configuración.** Columna nueva `llamadas_por_minuto integer` (`CHECK` entre 1 y 1000, `NULL` = usar `LLM_LLAMADAS_POR_MINUTO` o 15) en `configuracion_recalculo`, con una migración nueva (la anterior ya está desplegada): el registro de cambios y `configuracion_recalculo_servicio()` la incluyen, y solo un administrador la lee y la cambia, como el resto de parámetros (ADR-010). La Edge Function la combina con el entorno igual que los demás (lo guardado manda) y valida el mismo rango. En «Opciones avanzadas» de «Configuración del recálculo» aparece «Llamadas a Gemini por minuto» y el resumen muestra «15 llamadas por minuto (por defecto)».
- **No se guarda en el cálculo.** A diferencia del umbral o el modelo, el ritmo no cambia el resultado (RNF-09), así que se lee de la configuración vigente en cada paso: bajarlo o subirlo a mitad de un recálculo se aplica al siguiente paso.

## Consecuencias

- Un recálculo completo con Gemini tarda más: a 15 por minuto, cada llamada cuesta 4 s (un paso de 5 lotes, unos 20 s). Con `RECALCULO_MAX_CANDIDATOS=15` el tiempo baja de forma proporcional.
- Con el plan de pago se puede subir el valor (hasta 1000) y el recálculo vuelve a ir rápido.
- Con menos de 4 llamadas por minuto, un paso con 5 lotes necesitaría más de 90 s de espera y podría superar los 150 s de la Edge Function (el paso queda pendiente y se puede reanudar): para ritmos tan bajos conviene reducir `RECALCULO_MAX_CANDIDATOS`.
- La espera ocurre dentro de la invocación: mientras tanto el navegador muestra el paso en curso. Cerrar la pestaña no pierde nada (los pasos son idempotentes).
- Pruebas: `supabase/functions/_shared/ritmo_gemini.test.ts` y `configuracion.test.ts` (Deno), `supabase/tests/configuracion.test.sql` (pgTAP), `formularioConfiguracion.test.ts`, `AdminConfiguracionPage.test.tsx`, `EstadoClasificador.test.tsx` y `apiSupabase.test.ts` (Vitest).
