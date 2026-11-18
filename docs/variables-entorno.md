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

| Variable                    | Tipo / valor                                                |
| --------------------------- | ----------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | Secreta (la inyecta la plataforma)                          |
| `OPENALEX_API_KEY`          | Secreta                                                     |
| `CROSSREF_MAILTO`           | Correo del equipo                                           |
| `LLM_PROVIDER`              | `gemini` \| `fake`                                          |
| `GEMINI_API_KEY`            | Secreta                                                     |
| `LLM_MODEL`                 | `gemini-3.1-flash-lite`                                     |
| `LLM_UMBRAL`                | `0.7`                                                       |
| `RECALCULO_MAX_CANDIDATOS`  | `50` (`15` para la demo)                                    |
| `ADMIN_EMAIL`               | Solo README / paso manual: correo del administrador inicial |
