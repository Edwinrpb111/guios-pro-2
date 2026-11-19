# ADR-015: Trazabilidad de referencias (confianza, evidencia y candidatos rechazados)

- **Estado**: aceptada
- **Fecha**: 24/11/2026
- **Issues**: #46

## Contexto

Para cada candidato la IA devuelve `trata_subfactor`, `confianza` y `evidencia` (una frase que justifica el veredicto). Hasta ahora solo se guardaban los aceptados (título, año, DOI y base) y el veredicto se descartaba en `aceptarVeredictos` y en `buscarYClasificar`: no se podía responder «¿por qué este factor obtuvo esta puntuación?» ni revisar qué artículos se tomaron en cuenta y cuáles no. Los rechazados no se guardaban de ningún modo.

## Decisión

### Base de datos (migración aditiva `20261124100000_trazabilidad_referencias.sql`)

- `referencia` (aceptadas) gana `confianza numeric` (`CHECK (confianza BETWEEN 0 AND 1)`, admite `NULL`) y `evidencia varchar(500)` (admite `NULL`). Los cálculos anteriores quedan con ambas en `NULL`: la pantalla dice **«sin datos de clasificación»**. No se reconstruyen.
- Tabla nueva `referencia_rechazada`: los candidatos que la IA **sí clasificó** y no aceptó.

  | Columna                   | Tipo                                                                                                          |
  | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
  | `id_referencia_rechazada` | `integer generated always as identity`, clave primaria                                                        |
  | `id_calculo`              | `integer not null`, FK a `calculo_sugerida` con `ON DELETE CASCADE`                                           |
  | `id_subfactor`            | `integer not null`, FK a `subfactor`                                                                          |
  | `titulo`                  | `varchar(500) not null`                                                                                       |
  | `anio`                    | `smallint not null`                                                                                           |
  | `doi`                     | `varchar(200) not null`                                                                                       |
  | `base_datos`              | `varchar(40)`, admite `NULL` (`openalex` o `crossref`)                                                        |
  | `confianza`               | `numeric`, `CHECK (confianza BETWEEN 0 AND 1)`, admite `NULL`                                                 |
  | `evidencia`               | `varchar(500)`, admite `NULL`                                                                                 |
  |                           | `UNIQUE (id_calculo, id_subfactor, doi)`; índice por `id_subfactor` (`referencia_rechazada_id_subfactor_idx`) |

- **Seguridad**: RLS activa; una sola política, `select` para `authenticated` con `es_admin()` (mismo patrón que `referencia` y `recalculo_paso`). No hay políticas de escritura y además se quitan `insert`, `update` y `delete` a `anon` y `authenticated`: solo escribe `service_role` (la Edge Function `recalculo-paso`). Un decisor y un anónimo ven 0 filas; un administrador no escribe desde el cliente (error 42501).
- No se edita ninguna migración anterior.

### Qué es un «rechazado»

Solo el candidato que la IA clasificó (`repartirVeredictos`, `clasificador.ts`) con `trata_subfactor` falso **o** `confianza < umbral` (o no numérica). **No** se guardan como rechazados:

- los candidatos descartados antes de clasificar (sin DOI válido, sin año o fuera del rango de años) ni los repetidos por DOI;
- los `indice` inválidos que invente o repita la IA (fuera de 1..n, no enteros) y los candidatos a los que la IA no dio veredicto.

Si la IA repite un índice manda el primer veredicto. Un candidato no puede estar a la vez en aceptados y rechazados.

### Edge Functions

- **Saneado del veredicto** (`limpiarEvidencia`, `clasificador.ts`). La evidencia es texto de la IA sobre títulos y resúmenes ajenos: se trata como **no confiable**. Se guarda como texto plano (no se interpreta ni se elimina marcado: la pantalla debe mostrarla como texto, nunca como HTML), con los caracteres de control reemplazados por espacios (Postgres no admite U+0000 y tumbaría el paso), recortada, limitada a **500 caracteres** sin partir un par sustituto, y `NULL` si queda vacía. La confianza se acota a 0..1 (la columna lo exige; un valor fuera de rango no debe tumbar el paso) y es `NULL` si no es un número. El veredicto de aceptación sigue usando el valor original de la IA.
- **Nunca se registra la evidencia.** Ni la línea `console.log` del paso ni el `registro` de `recalculo_paso` la llevan (siguen sin llevar claves, direcciones, prompts ni textos de candidatos, ADR-013). Los mensajes de error de la base no incluyen datos de la fila.
- **`completarPaso`** recibe aceptadas y rechazadas. Aceptadas: `upsert` por `(id_calculo, id_subfactor, doi)` **sin** `ignoreDuplicates`, así que al repetir el paso la referencia ya guardada actualiza su confianza y evidencia. Rechazadas: se **reemplazan**: `delete` de las del subfactor en ese cálculo (también si ahora no hay ninguna) y `insert` de las nuevas. Luego marca el paso `hecho`. Los pasos siguen siendo idempotentes y un paso que falla no guarda nada nuevo.
- Los rechazados salen en el orden de las tandas, igual que los aceptados (ADR-014).

### Pantalla (issue #46, S17c–d)

El detalle del cálculo (P-10) muestra, por subfactor, pestañas **«Aceptados»** y **«Rechazados»** ordenadas por confianza, con evidencia y DOI. Los cálculos previos a esta migración dicen «sin datos de clasificación». Solo lectura y solo administradores.

## Consecuencias

- Se puede auditar cada cᵢ: qué artículos lo componen, con qué confianza y por qué, y qué se descartó. La importancia sugerida no cambia: IL e IS siguen saliendo de las referencias aceptadas.
- Más filas por cálculo: hasta `RECALCULO_MAX_CANDIDATOS` por subfactor entre aceptadas y rechazadas (50 × 61 subfactores como máximo). Se borran en cascada con el cálculo.
- Límite conocido: el reemplazo de rechazados no es atómico (`delete` y luego `insert` en dos llamadas). Si falla entre ambas, el paso termina con error, queda reanudable y al repetirlo se vuelve a reemplazar.
- Límite conocido: al repetir un paso, una referencia que antes era aceptada y ahora la IA rechaza sigue en `referencia` (el upsert no borra) y aparece también como rechazada. Ya ocurría con la aceptación de la versión anterior; se resuelve descartando el cálculo y recalculando.
- La evidencia viene de un modelo de lenguaje: puede ser imprecisa. Es una ayuda para revisar, no una prueba.
- Pruebas: `supabase/tests/trazabilidad_referencias.test.sql` (pgTAP: estructura, restricciones, RLS, cascada) y, en Deno, `clasificador.test.ts` (reparto y saneado), `busqueda.test.ts`, `trazabilidad.test.ts` (paso completo, reintento y que la evidencia no se registre) y `supabase_real.test.ts` (upsert, delete + insert).
