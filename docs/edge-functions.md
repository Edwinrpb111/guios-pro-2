# Edge Functions del recálculo de IS (HU-07)

Buscan literatura, clasifican con IA y guardan las referencias que alimentan el cálculo de la importancia sugerida (BRIEF §11.3, §13). Son **Deno** y no importan `guios-core` (ADR-002): IL e IS las calcula el navegador del administrador con `conteo_citas` y `guardar_resultado_calculo`.

## Contrato

Las dos funciones exigen `Authorization: Bearer <JWT>` de un **administrador** y solo aceptan `POST`.

| Función                                | Entrada                              | Salida (200)                     |
| -------------------------------------- | ------------------------------------ | -------------------------------- |
| `POST /functions/v1/recalculo-iniciar` | `{anio_inicio, anio_fin, fuentes[]}` | `{id_calculo}`                   |
| `POST /functions/v1/recalculo-paso`    | `{id_calculo}`                       | `{progreso, pendientes, estado}` |

- `fuentes` ⊂ `["openalex", "crossref"]`. Los años van de 1900 a 2100 y `anio_inicio ≤ anio_fin`.
- `recalculo-iniciar` crea el `calculo_sugerida` (`en_proceso`, `origen = 'ia'`) con los **parámetros** usados (años, fuentes, umbral, modelo, proveedor, versión del prompt y límite de candidatos; RNF-09) y un `recalculo_paso` `pendiente` por cada subfactor del catálogo (61).
- `recalculo-paso` procesa **un** subfactor por invocación (los planes Free limitan cada invocación a 150 s y 2 s de CPU). `progreso` es el número de factores (0..18) con todos sus pasos hechos; `pendientes`, los pasos que faltan (`pendiente` o `error`). Con `pendientes = 0` ya se puede calcular IL/IS y llamar a `guardar_resultado_calculo`; llamarla otra vez no hace nada.
- Usa el umbral, el límite y el modelo **guardados en el cálculo**, no los de la configuración o el entorno actuales.

### Errores

Siempre `{error, codigo}` con un mensaje en español; algunos añaden datos (`estado`, `progreso`, `pendientes`).

| HTTP | `codigo`                                                    | Cuándo                                                                                                                                                                             |
| ---- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | `solicitud_invalida`                                        | Cuerpo que no es JSON o campos inválidos                                                                                                                                           |
| 401  | `no_autenticado`, `sesion_invalida`                         | Sin JWT o JWT inválido                                                                                                                                                             |
| 403  | `solo_administrador`                                        | **Un decisor**                                                                                                                                                                     |
| 403  | `origen_no_permitido`                                       | `Origin` distinto del frontend (CORS)                                                                                                                                              |
| 404  | `calculo_no_encontrado`                                     | `id_calculo` inexistente                                                                                                                                                           |
| 405  | `metodo_no_permitido`                                       | Método distinto de POST                                                                                                                                                            |
| 503  | `paso_sin_tiempo`                                           | El paso agotó su tope de 110 s (ver abajo). El cálculo queda `pausado` y el paso, `pendiente`: se reanuda                                                                          |
| 409  | `calculo_cerrado`, `proveedor_cambiado`, `calculo_invalido` | El cálculo ya no está en curso; el proveedor (app o `LLM_PROVIDER`) cambió desde que empezó; sin fuentes guardadas                                                                 |
| 502  | `respuesta_invalida`                                        | Una API respondió algo que no se puede interpretar. El paso queda en `error` y el cálculo en `pausado`                                                                             |
| 503  | `proveedor_no_disponible`                                   | 429/503 de Gemini o del proveedor compatible tras agotar los reintentos, otro 5xx, caída de red, clave rechazada o sin saldo (402). El cálculo queda `pausado` con `mensaje_error` |
| 500  | `catalogo_vacio`, `error_interno`                           | Catálogo sin sembrar, o fallo inesperado o de configuración (sin detalle al cliente)                                                                                               |

**Orden de las comprobaciones.** Primero el token: sin `Authorization: Bearer` la respuesta es 401 sin tocar la configuración. Los errores de configuración (`configuracion_*`: variable ausente o inválida) se registran solo en el servidor y el cliente recibe `error_interno`, sin nombrar variables.

### Tope de 110 s por paso (issue #43, [ADR-013](decisiones/ADR-013-tope-por-paso-y-registro-del-recalculo.md))

- Cada invocación de `recalculo-paso` tiene un presupuesto de **110 s** de reloj de pared, contado desde que entra: incluye búsquedas, llamadas a la IA, esperas de ritmo y reintentos. Deja 40 s de margen sobre los 150 s de la plataforma.
- Cada `fetch` usa `min(su tiempo propio, tiempo restante)`: OpenAlex y Crossref 20 s; Gemini y el compatible con OpenAI **30 s** (antes 60 s).
- No se empieza un lote, una espera de ritmo ni un reintento si quedarían menos de **15 s**.
- Al agotarse: respuesta **503 `paso_sin_tiempo`** con «El subfactor «X» tardó más de lo permitido (110 s). Sube las llamadas por minuto y reanuda, o inicia un cálculo nuevo con menos candidatos.», cálculo `pausado` (con ese `mensaje_error`) y paso `pendiente` sin guardar nada parcial. Volver a invocar reanuda el mismo subfactor.

### Registro por paso (issue #43)

`recalculo_paso` guarda el **último intento** de cada subfactor en tres columnas que solo escribe la función (`service_role`) y lee el administrador:

| Columna       | Contenido                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iniciado_en` | Cuándo empezó el intento (se escribe al empezar: un paso cortado por la plataforma la conserva)                                                                                                         |
| `duracion_ms` | Cuánto tardó; **nula** si el paso sigue en curso o lo cortaron                                                                                                                                          |
| `registro`    | JSON: `intento`, `proveedor`, `busqueda[{fuente, ms, candidatos, error}]`, `lotes[{n, tamano, ms, reintentos, resultado, aceptados}]`, `aceptados`, `resultado` (`hecho`/`pausado`/`error`) y `mensaje` |

- `intento` sube cada vez que se repite el mismo paso. Mientras el intento corre, `registro` es provisional (`resultado: error`, «El paso no terminó…»); lo reemplaza al terminar.
- `lotes[].resultado`: `ok`, `reintento_agotado`, `sin_tiempo`, `clave_rechazada`, `sin_saldo`, `respuesta_invalida` o `error`.
- Nunca incluye claves, direcciones, prompts ni textos de candidatos. `detalle` conserva su significado de siempre.
- Si no se puede escribir el registro, el paso sigue (el fallo queda en los logs del servidor).

**Logs de la función.** Cada intento escribe **una** línea JSON con `console.log`, sin claves, URL ni textos:

```json
{evento:recalculo_paso,id_calculo:4,id_subfactor:12,subfactor:1.2,intento:1,proveedor:gemini,resultado:pausado,duracion_ms:110512,busqueda:[{fuente:openalex,ms:1834,candidatos:25}],candidatos:25,lotes:3,aceptados:0}
```

Para verlos: panel de Supabase → **Edge Functions** → **recalculo-paso** → **Logs**. Los fallos inesperados (`error_interno`) y los fallos al escribir el registro aparecen ahí como `console.error`.

### Pausa y reanudación (BRIEF §13.5)

- Gemini: antes de cada llamada se espera para respetar `llamadas_por_minuto` (15 por defecto) y un 429 o 503 se reintenta hasta 3 veces, esperando el `retryDelay` de Gemini (máximo 30 s por espera y 90 s en total por paso, siempre dentro del tope de 110 s del paso); el clasificador falso no espera ([ADR-011](decisiones/ADR-011-ritmo-de-llamadas-a-gemini.md)).
- Compatible con OpenAI (issue #40): mismo ritmo y mismos reintentos, usando la cabecera `Retry-After` ([ADR-012](decisiones/ADR-012-proveedor-compatible-con-openai.md)).
- Si se agotan esos reintentos, o falla otra API o la red (sin reintento), **no se reintenta en bucle**: el cálculo pasa a `pausado`, se guarda un `mensaje_error` legible y la respuesta (503/502) incluye `{estado: 'pausado', progreso, pendientes}`.
- Volver a invocar `recalculo-paso` **reanuda** (`pausado → en_proceso`, se borra el mensaje) desde el paso pendiente o con error. Cerrar la pestaña no pierde nada: lo hecho queda guardado.
- Los pasos son idempotentes (`UNIQUE (id_calculo, id_subfactor, doi)`): repetir uno no duplica referencias.
- Un recálculo pausado o fallido nunca afecta a las evaluaciones: sigue vigente el cálculo anterior.

## Pipeline de un paso

1. Consulta: «open source software adoption FLOSS» + términos del factor + términos del subfactor (`_shared/contexto_subfactores.json`, versionado; hay que revisarlo una vez con el equipo).
2. Busca en OpenAlex y Crossref (en serie) con filtro de años y tipo artículo.
3. Normaliza el DOI (minúsculas, sin `https://doi.org/`), **descarta lo que no tiene DOI válido, año o está fuera del rango** y deduplica por DOI.
4. Recorta a `RECALCULO_MAX_CANDIDATOS` repartiendo entre fuentes y clasifica en **lotes de 10**.
5. Acepta si `trata_subfactor` y `confianza ≥ umbral` (`LLM_UMBRAL`, 0,7 por defecto); **todo `indice` inexistente se descarta**.
6. Guarda los aceptados en `referencia` y marca el paso `hecho`.

La IA no busca: solo clasifica candidatos que ya trajo una API bibliográfica, así que toda referencia guardada tiene un DOI real. A Gemini solo se le envían títulos y resúmenes públicos; el texto de los candidatos se trata como dato no confiable en el prompt.

## Interfaces y falsos (RNF-07)

`ProveedorBusqueda` (`OpenAlexProveedor`, `CrossrefProveedor`) y `Clasificador` (`GeminiClasificador`, `ClasificadorCompatibleOpenAI` en `clasificador_openai.ts`, con `LLM_PROVIDER=openai`) están en `supabase/functions/_shared/`. Con `LLM_PROVIDER=fake` se usan `ProveedorFalso` y `ClasificadorFalso`: sin red, sin claves, resultados siempre iguales. Es el modo de las pruebas, del CI y de la demostración.

## Configuración: base primero, entorno después (issue #33)

En cada petición con token, `entorno.ts` llama a `crearDependenciasConBase`, que lee con `service_role` la función SQL `configuracion_recalculo_servicio()` (parámetros de `configuracion_recalculo` y claves descifradas de Supabase Vault) y la combina con `Deno.env` en `combinarConEntorno`:

| Lo guardado en la app (`/admin/configuracion`) | Si falta, variable de entorno |
| ---------------------------------------------- | ----------------------------- |
| Proveedor del clasificador                     | `LLM_PROVIDER`                |
| Modelo                                         | `LLM_MODEL`                   |
| Umbral                                         | `LLM_UMBRAL`                  |
| Máximo de candidatos                           | `RECALCULO_MAX_CANDIDATOS`    |
| Correo de Crossref                             | `CROSSREF_MAILTO`             |
| Clave de Gemini (Vault)                        | `GEMINI_API_KEY`              |
| Dirección base del compatible con OpenAI       | `OPENAI_COMPAT_BASE_URL`      |
| Modelo del compatible con OpenAI               | `OPENAI_COMPAT_MODEL`         |
| Clave del compatible con OpenAI (Vault)        | `OPENAI_COMPAT_API_KEY`       |
| Clave de OpenAlex (Vault)                      | `OPENALEX_API_KEY`            |

- Las validaciones (`configuracion_invalida`, `configuracion_incompleta`) se aplican al resultado combinado; el cliente sigue recibiendo solo `error_interno`.
- Si la lectura de la base falla, la petición responde `error_interno`: no se sigue en silencio con otra configuración.
- `ORIGENES_PERMITIDOS` nunca sale de la base.
- Ninguna función que pueda llamar el navegador devuelve una clave: `configuracion_recalculo_servicio()` solo la ejecuta `service_role` ([ADR-010](decisiones/ADR-010-configuracion-del-recalculo-y-vault.md)).

## Variables

Ver [`variables-entorno.md`](variables-entorno.md). En local, `supabase/config.toml` fija `LLM_PROVIDER = "fake"` para las funciones; mientras no se guarde otro proveedor en la app, es el que se usa.

## Probar

```bash
npm run test:functions        # pruebas de las funciones (Deno 2; usan proveedores y clasificador falsos)
npm run typecheck:functions   # deno check de todas las funciones
```

Para probarlas contra Supabase local (necesita Docker):

```bash
npx supabase start
npx supabase functions serve
# registra un usuario en la app, súbele el rol (README → «Administrador inicial») y llama con su JWT:
curl -X POST http://127.0.0.1:54321/functions/v1/recalculo-iniciar \
  -H "Authorization: Bearer <JWT del administrador>" -H "Content-Type: application/json" \
  -d '{"anio_inicio": 2020, "anio_fin": 2025, "fuentes": ["openalex", "crossref"]}'
```

Despliegue (último paso del proyecto, issue #13): `npx supabase functions deploy` y `npx supabase secrets set ...`.
