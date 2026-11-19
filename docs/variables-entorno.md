# Variables de entorno (BRIEF §13.7)

Solo las variables `VITE_` llegan al navegador. Ninguna clave se sube al repositorio.

## Cliente (Vercel y archivo local `.env.local`, ignorado por Git)

| Variable                 | Valor                                      |
| ------------------------ | ------------------------------------------ |
| `VITE_SUPABASE_URL`      | _Project URL_ del proyecto de Supabase     |
| `VITE_SUPABASE_ANON_KEY` | _anon public key_ del proyecto de Supabase |

Ejemplo de `.env.local`:

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key que muestra `supabase start`>
```

## Pruebas de integración (solo en la terminal; nunca en Vercel ni en la CI)

| Variable                    | Valor                                                                            |
| --------------------------- | -------------------------------------------------------------------------------- |
| `SUPABASE_URL_PRUEBAS`      | URL de la API de Supabase **local**, p. ej. `http://127.0.0.1:54321`             |
| `SUPABASE_ANON_KEY_PRUEBAS` | _anon key_ de Supabase local (`npx supabase status -o env`, variable `ANON_KEY`) |

Si faltan, `src/lib/auth.integracion.test.ts` se omite. Se pasan en la línea de comandos (ver README); no se guardan en `.env.local`, porque `vitest` solo expone al navegador las que empiezan con `VITE_`.

## Edge Functions (secretos de Supabase, `supabase secrets set`)

Desde el issue #33, un administrador puede definir `LLM_PROVIDER`, `LLM_MODEL`, `LLM_UMBRAL`, `RECALCULO_MAX_CANDIDATOS`, `LLM_LLAMADAS_POR_MINUTO`, `CROSSREF_MAILTO`, `GEMINI_API_KEY` y `OPENALEX_API_KEY` desde la app, en **Configuración del recálculo** (`/admin/configuracion`): se elige **Gemini** o **Falso (demostración)**, la clave de Gemini aparece en el mismo bloque y el resto (modelo, umbral, máximo de candidatos, llamadas a Gemini por minuto, correo de Crossref y «Usar el secreto de Supabase») está en «Opciones avanzadas». La pantalla resume qué se usará de verdad; si un valor está vacío muestra el valor por defecto de la Edge Function («por defecto»), que un secreto de Supabase puede cambiar. Si el proveedor no está fijado en la app, lo decide `LLM_PROVIDER`, que la app no puede ver: conviene fijarlo en la pantalla. **Lo guardado en la app manda; lo que no está definido ahí sale de estos secretos** y, si tampoco están, del valor por defecto. Las claves se guardan cifradas en Supabase Vault y nunca vuelven al navegador ([ADR-010](decisiones/ADR-010-configuracion-del-recalculo-y-vault.md)). `ORIGENES_PERMITIDOS`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` solo se configuran como secretos.

| Variable                    | Tipo / valor                                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | Secreta (la inyecta la plataforma)                                                                                                                                                              |
| `OPENALEX_API_KEY`          | Secreta                                                                                                                                                                                         |
| `CROSSREF_MAILTO`           | Correo del equipo                                                                                                                                                                               |
| `LLM_PROVIDER`              | `gemini` \| `fake`                                                                                                                                                                              |
| `GEMINI_API_KEY`            | Secreta                                                                                                                                                                                         |
| `LLM_MODEL`                 | `gemini-3.1-flash-lite`                                                                                                                                                                         |
| `LLM_UMBRAL`                | `0.7`                                                                                                                                                                                           |
| `RECALCULO_MAX_CANDIDATOS`  | `50` (`15` para la demo)                                                                                                                                                                        |
| `LLM_LLAMADAS_POR_MINUTO`   | `15`. Máximo de llamadas por minuto a Gemini (entero de 1 a 1000); ver la nota de abajo                                                                                                         |
| `ORIGENES_PERMITIDOS`       | Orígenes del frontend que acepta CORS, separados por comas. Por defecto `http://localhost:5173,http://127.0.0.1:5173`; en producción, la URL de Vercel. Solo secreto: no se cambia desde la app |
| `ADMIN_EMAIL`               | Solo README / paso manual: correo del administrador inicial                                                                                                                                     |

Notas:

- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta la plataforma en las Edge Functions; no se definen a mano.
- `ORIGENES_PERMITIDOS` no figura en BRIEF §13.7: se añade para cumplir §14 («solo aceptan el origen del frontend»).
- Con `LLM_PROVIDER=fake` no hacen falta `OPENALEX_API_KEY` ni `GEMINI_API_KEY` ni red; `supabase/config.toml` lo fija para el entorno local. Con `gemini` hace falta `GEMINI_API_KEY` y, si se usa OpenAlex, `OPENALEX_API_KEY`; Crossref funciona sin clave (el correo `CROSSREF_MAILTO` es opcional, pero recomendable).
- `LLM_UMBRAL` debe estar entre 0 y 1; `RECALCULO_MAX_CANDIDATOS` es un entero entre 1 y 200. Un valor inválido hace que la función responda 500 `configuracion_invalida` con el nombre de la variable. La base aplica los mismos límites a lo que se guarda desde la app.
- `LLM_LLAMADAS_POR_MINUTO` (issue #39) es el ritmo del clasificador: antes de **cada** llamada a Gemini la Edge Function espera lo que haga falta para separar dos llamadas al menos `60000 / valor` ms (15 por minuto = 4 s) y, si Gemini responde 429 o 503, espera su `retryDelay` y reintenta hasta 3 veces antes de pausar el cálculo. El plan gratis de Gemini permite cerca de 15 por minuto; con facturación activada se puede subir. Con `LLM_PROVIDER=fake` no se espera nunca. Vacío = 15; un valor fuera de 1 a 1000 da 500 `configuracion_invalida`. Detalle en [ADR-011](decisiones/ADR-011-ritmo-de-llamadas-a-gemini.md).
- La configuración guardada en la app se lee en **cada petición**: un cambio se aplica al siguiente recálculo sin redesplegar. Un recálculo ya iniciado sigue con los parámetros guardados en el cálculo.
- Secretos de producción: `npx supabase secrets set NOMBRE=valor`, nunca en archivos versionados. Más detalle en [`edge-functions.md`](edge-functions.md).
