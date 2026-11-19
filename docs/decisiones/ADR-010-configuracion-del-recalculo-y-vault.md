# ADR-010: Configuración del recálculo desde la app, con claves en Supabase Vault

- **Estado**: aceptada
- **Fecha**: 19/11/2026
- **Issues**: #33

## Contexto

Hasta ahora el proveedor del clasificador, el modelo, el umbral, el máximo de candidatos, el correo de Crossref y las claves `GEMINI_API_KEY` y `OPENALEX_API_KEY` solo se cambiaban con `supabase secrets set` (BRIEF §13.7). Para probar otro umbral o reemplazar una clave había que usar la terminal cada vez. El equipo pidió cambiarlo desde la propia página, **solo como administrador**. Las claves no pueden llegar al navegador (BRIEF §14, RNF-05).

## Decisión

- **Una fila de parámetros no secretos.** `configuracion_recalculo` (clave `id boolean = true`, una sola fila) guarda `proveedor_llm` (`gemini` | `fake`), `modelo`, `umbral` (0..1), `max_candidatos` (1..200) y `crossref_mailto`, con los mismos `CHECK` que valida la Edge Function. **`NULL` significa «no definido»**: la función usa el secreto de entorno y, si tampoco está, el valor por defecto. Al aplicar la migración todo es `NULL`, así que nada cambia hasta que el administrador guarda algo.
- **Solo un administrador la lee y la cambia.** RLS con `es_admin()` para `select` y `update`; a `anon` se le revoca todo y a `authenticated` solo se le concede `select` y `update` de las cinco columnas de parámetros (sin `insert`, `delete` ni columnas de auditoría). Un decisor ve cero filas y su `update` no toca nada.
- **Quién y cuándo lo fija la base.** Un trigger `security definer` pone `actualizado_por = auth.uid()` y `actualizado_en = now()` y agrega una fila a `configuracion_recalculo_cambio` con los nuevos valores (solo parámetros) y el nombre de quien lo hizo. Guardar o borrar una clave también deja una fila («clave GEMINI_API_KEY guardada»), **sin el valor**. El registro solo lo lee un administrador y nadie lo escribe desde el cliente.
- **Claves de solo escritura en Supabase Vault** (`supabase_vault`, cifrado en reposo). Tres funciones `security definer`, con `search_path = ''`, `execute` revocado a `public` y `anon`, y `exigir_admin()` dentro:
  - `guardar_clave_recalculo(p_nombre, p_valor)`: crea o reemplaza el secreto `guios_recalculo_<nombre>` (sin espacios alrededor, 1..1000 caracteres). Solo acepta `GEMINI_API_KEY` y `OPENALEX_API_KEY` (error `22023`).
  - `borrar_clave_recalculo(p_nombre)`.
  - `estado_claves_recalculo()`: devuelve `nombre`, `configurada` y `actualizada_en`. **Nunca el valor.**
- **El valor descifrado solo lo leen las Edge Functions.** `configuracion_recalculo_servicio()` devuelve los parámetros y las claves descifradas; su `execute` está revocado a `public`, `anon` y `authenticated` y concedido solo a `service_role`. Una prueba pgTAP comprueba además que ninguna función de `public` ejecutable por `anon` o `authenticated` lee `vault.decrypted_secrets`.
- **La Edge Function combina base y entorno en cada petición.** `entorno.ts` crea el cliente de Supabase una vez y, en cada petición con token, `crearDependenciasConBase` lee la configuración guardada y la combina con `Deno.env` (`combinarConEntorno`): lo guardado manda y lo que falta sale del entorno. Las validaciones de siempre (`configuracion_invalida`, `configuracion_incompleta`) se aplican al resultado, venga de donde venga, y el cliente solo ve `error_interno`. Si la base no responde, la petición falla en lugar de seguir con otra configuración en silencio.
- **`ORIGENES_PERMITIDOS` queda fuera.** Es la defensa CORS de la función y se lee antes de autenticar; sigue siendo solo un secreto de Supabase (`combinarConEntorno` nunca lo toma de la base).
- **Interfaz.** `/admin/configuracion` («Configuración del recálculo» en el menú de administración, dentro del marco común) con un resumen de lo que usará el recálculo, un único bloque guiado para elegir el clasificador (Gemini o Falso, con la clave de Gemini en el mismo bloque; «Usar el secreto de Supabase», modelo, umbral, máximo de candidatos y correo de Crossref quedan en «Opciones avanzadas»; ver el issue #37), un aviso con «Usar Gemini» si hay una clave guardada que no se usa, los campos de clave como contraseña (nunca se rellenan, se vacían al guardar), el estado «Configurada · actualizada el …», reemplazar o borrar con confirmación, y los cambios recientes. P-09 (`/admin/sugerida/nuevo`) muestra un recuadro con el clasificador que se usará y un enlace a la configuración.

## Consecuencias

- Cambiar un parámetro o una clave se aplica al siguiente recálculo, sin redesplegar ni usar la terminal. Un recálculo en curso sigue usando los parámetros guardados en su `calculo_sugerida.parametros` (RNF-09); si se cambia el proveedor a mitad, `recalculo-paso` responde `proveedor_cambiado`.
- Cada petición a las Edge Functions hace una lectura más a la base (una RPC pequeña).
- El navegador no puede saber qué hay en los secretos de entorno: cuando un campo está vacío, la pantalla dice «se usa el secreto de Supabase», no su valor.
- Vault viene activo en los proyectos de Supabase y en la imagen local; la migración igual ejecuta `create extension if not exists supabase_vault`. Las funciones de claves dependen de que el rol `postgres` pueda usar `vault.create_secret`, `vault.update_secret` y borrar de `vault.secrets`, como en la imagen local.
- Las pruebas están en `supabase/tests/configuracion.test.sql` (pgTAP), `supabase/functions/_shared/configuracion.test.ts`, `dependencias.test.ts`, `supabase_real.test.ts` (Deno) y `AdminConfiguracionPage.test.tsx`, `AdminNuevoRecalculoPage.test.tsx`, `apiSupabase.test.ts` (Vitest).
- El ritmo de llamadas a Gemini (`llamadas_por_minuto`, issue #39) se añadió después como una sexta columna de parámetros con su propia migración: ver [ADR-011](ADR-011-ritmo-de-llamadas-a-gemini.md).
