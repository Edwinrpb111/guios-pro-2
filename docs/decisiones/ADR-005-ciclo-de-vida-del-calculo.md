# ADR-005: Ciclo de vida del cálculo de IS garantizado por la base

- **Estado**: aceptada
- **Fecha**: 18/11/2026
- **Issues**: #10, #11

## Contexto

Un cálculo de IS pasa por `en_proceso → (pausado) → completado → publicado` o `descartado`. Alimenta a todas las evaluaciones nuevas, así que un estado inconsistente (un cálculo sin pasos, dos vigentes, un histórico borrado) daría resultados distintos a decisores distintos. Como IL e IS las calcula el navegador (ADR-002), la base no puede confiar en lo que le llega y debe imponer lo que sí puede comprobar.

## Decisión

- **Cálculo y pasos se crean atómicamente.** La primera versión de `recalculo-iniciar` insertaba el cálculo y luego los 61 pasos; si la segunda inserción fallaba quedaba un cálculo `en_proceso` huérfano. Ahora una sola función SQL, `crear_calculo_con_pasos`, hace ambas cosas en una transacción y solo la ejecuta `service_role`: el administrador no puede crear cálculos sin pasar por la Edge Function.
- **La base verifica lo que puede recalcular sin duplicar reglas**: `guardar_resultado_calculo` exige un paso `hecho` por cada subfactor, exactamente 18 filas (una por factor del catálogo) y que `n`, `cᵢ` e `IE` coincidan con el catálogo y las referencias (`cᵢ` es la suma de las citas de los subfactores del factor, trampa 6). **No verifica IL ni IS**: el método de cuartiles es una constante con nombre que puede cambiar (BRIEF §17.4), y duplicarlo en SQL rompería el punto único de las reglas.
- **Un solo vigente.** `publicar_calculo` solo publica un cálculo `completado`, bloquea el vigente anterior para serializar publicaciones simultáneas y lo deja como histórico (`publicado`, no vigente) con sus 18 filas. El índice único parcial `uq_calculo_vigente` y el CHECK `calculo_vigente_publicado` lo respaldan.
- **El histórico no se borra.** `descartar_calculo` rechaza el vigente, cualquier cálculo publicado y cualquier cálculo que usen evaluaciones, para conservar qué IS estuvo vigente y cuándo (RNF-09).
- **Pausa manual en la base.** `pausar_calculo` (`en_proceso → pausado`) deja constancia del estado; sin ella, detener el bucle en el navegador dejaba P-08 mostrando «en proceso». El mismo mecanismo de reanudación de la Edge Function sirve para la pausa manual y para la de un error de proveedor.
- **Las evaluaciones guardan su `id_calculo` y su fotografía de IS** (trampa 9): publicar o descartar un cálculo nunca cambia evaluaciones ya hechas.

## Consecuencias

- Las reglas anteriores se prueban en SQL (`supabase/tests/recalculo.test.sql`, `npm run test:db`), no solo en la interfaz.
- Todas las RPC exigen `es_admin()` y fallan con `42501` para un decisor; la ruta `/admin` solo evita mostrar pantallas inútiles.
- Detalle del flujo y de las reglas: [`docs/recalculo.md`](../recalculo.md).
