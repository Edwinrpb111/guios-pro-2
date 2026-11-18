# ADR-004: Recálculo de la IS en pasos cortos con Edge Functions

- **Estado**: aceptada
- **Fecha**: 18/11/2026
- **Issues**: #10 (Edge Functions), #11 (pantallas P-08..P-10)

## Contexto

Recalcular la importancia sugerida (IS) exige buscar artículos en OpenAlex y Crossref para los 61 subfactores y clasificarlos con un LLM (BRIEF §13). Las Edge Functions del plan Free de Supabase viven como máximo 150 s y tienen 2 s de CPU por invocación, y las claves de las APIs no pueden llegar al navegador (RNF-05). Además, las APIs externas fallan (429, caídas) y el administrador puede cerrar la pestaña a mitad del proceso.

## Decisión

- **Una invocación corta por subfactor, no una función larga.** `recalculo-iniciar` crea el cálculo y los 61 pasos; `recalculo-paso` procesa **un** paso pendiente (buscar, normalizar DOI, deduplicar, recortar, clasificar en lotes de 10, guardar). El **bucle vive en el navegador** del administrador (`useRecalculo`, pantalla P-09), que muestra el progreso 0..18 factores (RNF-04).
- **La IA solo clasifica; no busca.** Los candidatos salen de OpenAlex y Crossref, así que toda referencia guardada tiene un DOI real. Se acepta si `trata_subfactor` y `confianza ≥ umbral`; todo `indice` que no esté en la lista enviada se descarta. Solo se envían títulos y resúmenes públicos, y el texto de los candidatos se trata como dato no confiable en el prompt.
- **Idempotencia.** `UNIQUE (id_calculo, id_subfactor, doi)` hace que repetir un paso no duplique referencias; por eso reanudar es seguro.
- **Pausa y reanudación sin reintentos en bucle.** Un 429 o una caída deja el cálculo `pausado` con un mensaje legible; volver a invocar `recalculo-paso` reanuda desde lo pendiente. Un recálculo pausado, fallido o descartado no afecta a las evaluaciones, que siguen apuntando al cálculo vigente.
- **Los parámetros se guardan en el cálculo** (años, fuentes, umbral, modelo, proveedor, versión del prompt, límite de candidatos) y los pasos usan esos y no los del entorno actual (RNF-09). Si `LLM_PROVIDER` cambia a mitad de un cálculo, se rechaza (`proveedor_cambiado`) para no mezclar clasificadores.
- **Proveedores intercambiables** (`ProveedorBusqueda`, `Clasificador`, RNF-07). Con `LLM_PROVIDER=fake` hay búsqueda y clasificador falsos: sin red ni claves, resultados fijos. Es el modo de las pruebas, de la CI y de la demostración local; el real exige `gemini`.
- **Las funciones no importan `guios-core`** (ADR-002). IL e IS las calcula el navegador del administrador con los conteos que devuelve la base (ver ADR-005).
- **Seguridad.** Ambas funciones tienen `verify_jwt = true`, además comprueban que el usuario sea administrador (403 `solo_administrador`) y solo aceptan el origen del frontend (`ORIGENES_PERMITIDOS`). Los errores de configuración se registran en el servidor y el cliente solo recibe `error_interno`.

## Consecuencias

- El recálculo completo son unas 61 invocaciones seriadas desde el navegador: es más lento que una función larga, pero cabe en los límites del plan Free y se puede pausar y retomar.
- Si el administrador cierra la pestaña, el proceso se detiene hasta que vuelva a abrir `/admin/sugerida/:id`.
- `contexto_subfactores.json` (descripciones ampliadas de los 61 subfactores) está versionado y debe revisarlo el equipo una vez.
- Contrato, errores y cómo probarlas: [`docs/edge-functions.md`](../edge-functions.md).
