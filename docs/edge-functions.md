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
- Usa el umbral, el límite y el modelo **guardados en el cálculo**, no los del entorno actual.

### Errores

Siempre `{error, codigo}` con un mensaje en español; algunos añaden datos (`estado`, `progreso`, `pendientes`).

| HTTP | `codigo`                                                                                | Cuándo                                                                                                 |
| ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 400  | `solicitud_invalida`                                                                    | Cuerpo que no es JSON o campos inválidos                                                               |
| 401  | `no_autenticado`, `sesion_invalida`                                                     | Sin JWT o JWT inválido                                                                                 |
| 403  | `solo_administrador`                                                                    | **Un decisor**                                                                                         |
| 403  | `origen_no_permitido`                                                                   | `Origin` distinto del frontend (CORS)                                                                  |
| 404  | `calculo_no_encontrado`                                                                 | `id_calculo` inexistente                                                                               |
| 405  | `metodo_no_permitido`                                                                   | Método distinto de POST                                                                                |
| 409  | `calculo_cerrado`, `proveedor_cambiado`, `calculo_invalido`                             | El cálculo ya no está en curso; `LLM_PROVIDER` cambió desde que empezó; sin fuentes guardadas          |
| 502  | `respuesta_invalida`                                                                    | Una API respondió algo que no se puede interpretar. El paso queda en `error` y el cálculo en `pausado` |
| 503  | `proveedor_no_disponible`                                                               | 429, 5xx, caída de red o clave rechazada. El cálculo queda `pausado` con `mensaje_error`               |
| 500  | `configuracion_incompleta`, `configuracion_invalida`, `catalogo_vacio`, `error_interno` | Falta un secreto, valor inválido, catálogo sin sembrar o fallo inesperado (sin detalle al cliente)     |

### Pausa y reanudación (BRIEF §13.5)

- Un 429 o una caída de cualquier API **no se reintenta en bucle**: el cálculo pasa a `pausado`, se guarda un `mensaje_error` legible y la respuesta (503/502) incluye `{estado: 'pausado', progreso, pendientes}`.
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

`ProveedorBusqueda` (`OpenAlexProveedor`, `CrossrefProveedor`) y `Clasificador` (`GeminiClasificador`) están en `supabase/functions/_shared/`. Con `LLM_PROVIDER=fake` se usan `ProveedorFalso` y `ClasificadorFalso`: sin red, sin claves, resultados siempre iguales. Es el modo de las pruebas, del CI y de la demostración.

## Variables

Ver [`variables-entorno.md`](variables-entorno.md). En local, `supabase/config.toml` fija `LLM_PROVIDER = "fake"` para las funciones.

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
