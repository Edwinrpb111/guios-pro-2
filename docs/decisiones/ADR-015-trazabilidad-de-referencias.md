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

- **Seguridad**: RLS activa; una sola política, `select` para `authenticated` con `es_admin()` (mismo patrón que `referencia` y `recalculo_paso`). No hay políticas de escritura y además se hace `revoke all` a `anon` y `authenticated` y se devuelve solo `select` a `authenticated`: `TRUNCATE`, `REFERENCES` y `TRIGGER` no pasan por RLS y no deben quedar abiertos. Solo escribe `service_role` (la Edge Function `recalculo-paso`). Un decisor ve 0 filas; un anónimo no tiene privilegio de lectura (42501); un administrador no escribe ni vacía la tabla desde el cliente (42501).
- No se edita ninguna migración anterior.

### Qué es un «rechazado»

Solo el candidato que la IA clasificó (`repartirVeredictos`, `clasificador.ts`) con `trata_subfactor` falso **o** `confianza < umbral` (o no numérica). **No** se guardan como rechazados:

- los candidatos descartados antes de clasificar (sin DOI válido, sin año o fuera del rango de años) ni los repetidos por DOI;
- los `indice` inválidos que invente o repita la IA (fuera de 1..n, no enteros) y los candidatos a los que la IA no dio veredicto.

Si la IA repite un índice manda el primer veredicto. Un candidato no puede estar a la vez en aceptados y rechazados.

### Edge Functions

- **Saneado del veredicto** (`limpiarEvidencia`, `clasificador.ts`). La evidencia es texto de la IA sobre títulos y resúmenes ajenos: se trata como **no confiable**. Se guarda como texto plano (no se interpreta ni se elimina marcado: la pantalla debe mostrarla como texto, nunca como HTML), con los caracteres de control reemplazados por espacios (Postgres no admite U+0000 y tumbaría el paso), los sustitutos Unicode sueltos eliminados, recortada, limitada a **500 caracteres** sin partir un par sustituto, y `NULL` si queda vacía. La confianza se acota a 0..1 (la columna lo exige; un valor fuera de rango no debe tumbar el paso) y es `NULL` si no es un número. El veredicto de aceptación sigue usando el valor original de la IA.
- **Nunca se registra la evidencia.** Ni la línea `console.log` del paso ni el `registro` de `recalculo_paso` la llevan (siguen sin llevar claves, direcciones, prompts ni textos de candidatos, ADR-013). Los mensajes de error de la base no incluyen datos de la fila.
- **`completarPaso`** recibe aceptadas y rechazadas. Aceptadas: `upsert` por `(id_calculo, id_subfactor, doi)` **sin** `ignoreDuplicates`, así que al repetir el paso la referencia ya guardada actualiza su confianza y evidencia. Rechazadas: se **reemplazan**: `delete` de las del subfactor en ese cálculo (también si ahora no hay ninguna) y `upsert` de las nuevas por `(id_calculo, id_subfactor, doi)`; el `upsert` evita el error 23505 cuando dos corridas del mismo paso se intercalan (el cliente reintenta tras un 504) y dejaría el paso con error estando hecho. Luego marca el paso `hecho`. Los pasos siguen siendo idempotentes y un paso que falla no guarda nada nuevo.
- **Título y DOI** de cada candidato (aceptado o rechazado) pasan por la misma limpieza (`limpiarTexto`, `busqueda.ts`): sin caracteres de control (en el DOI se quitan, no se cambian por espacio) ni sustitutos sueltos, y el título se limita a 500 caracteres sin partir un par sustituto. Sin esto, un rechazado con `U+0000` o un sustituto suelto fallaba el paso en cada reintento.
- Los rechazados salen en el orden de las tandas, igual que los aceptados (ADR-014).

### Pantalla (issue #46, S17c–d)

El detalle del cálculo (P-10) muestra, por subfactor, pestañas **«Aceptados»** y **«Rechazados»** ordenadas por confianza, con evidencia y DOI. Los cálculos previos a esta migración dicen «sin datos de clasificación». Solo lectura y solo administradores.

## Consecuencias

- Se puede auditar cada cᵢ: qué artículos lo componen, con qué confianza y por qué, y qué se descartó. La importancia sugerida no cambia: IL e IS siguen saliendo de las referencias aceptadas.
- Más filas por cálculo: hasta `RECALCULO_MAX_CANDIDATOS` por subfactor entre aceptadas y rechazadas (50 × 61 subfactores como máximo). Se borran en cascada con el cálculo.
- Límite conocido: el reemplazo de rechazados no es atómico (`delete` y luego `insert` en dos llamadas). Si falla entre ambas, el paso termina con error, queda reanudable y al repetirlo se vuelve a reemplazar.
- Límite conocido (reintento): si un DOI se acepta en un intento de un paso y la IA lo rechaza en un intento posterior (porque el paso se repitió), el DOI sigue en `referencia` (el `upsert` no borra, con el veredicto del primer intento) y además aparece en `referencia_rechazada` con el veredicto del segundo. Los conteos, IL e IS leen **solo** `referencia`, así que son idénticos a los de `main` antes de #46: nada cambia en el resultado. La contradicción solo se ve en P-10 (el mismo DOI en «Aceptados» y en «Rechazados»). Está fijado con una prueba Deno (`trazabilidad.test.ts`) sobre el repositorio en memoria. Ya ocurría con la aceptación de la versión anterior; se resuelve descartando el cálculo y recalculando.
- **Orden de despliegue**: primero la migración (`supabase db push`), después las Edge Functions y por último el frontend (Vercel). La pantalla P-10 lee `referencia_rechazada` y las columnas nuevas de `referencia`: si el frontend sale antes que la migración, esa consulta falla. La migración es aditiva, así que el código anterior sigue funcionando con ella aplicada.
- La evidencia viene de un modelo de lenguaje: puede ser imprecisa. Es una ayuda para revisar, no una prueba.
- Pruebas: `supabase/tests/trazabilidad_referencias.test.sql` (pgTAP: estructura, restricciones, RLS, cascada) y, en Deno, `clasificador.test.ts` (reparto y saneado), `busqueda.test.ts`, `trazabilidad.test.ts` (paso completo, reintento y que la evidencia no se registre) y `supabase_real.test.ts` (upsert de aceptados, delete + upsert de rechazados).
