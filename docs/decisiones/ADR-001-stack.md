# ADR-001: Stack tecnológico

- **Estado**: aceptada
- **Fecha**: 17/11/2026

## Contexto

La propuesta del 10/10/2026 usaba FastAPI + Python + Docker. El sistema necesita persistencia, autenticación, autorización por usuario e integraciones con APIs externas (OpenAlex, Crossref, LLM) sin exponer claves, y un despliegue continuo con URL pública para el cliente.

## Decisión

No hay backend propio: el navegador habla con Supabase y las integraciones externas corren en Edge Functions (BRIEF §8.1).

| Capa                         | Tecnología                                                          |
| ---------------------------- | ------------------------------------------------------------------- |
| Frontend                     | React 18 + TypeScript estricto + Vite, React Router, TanStack Query |
| Hosting                      | Vercel (rewrite SPA en `vercel.json`)                               |
| Lógica del método            | `src/guios-core/`, TypeScript puro                                  |
| Base de datos                | Supabase PostgreSQL con migraciones SQL                             |
| Autenticación / autorización | Supabase Auth + tabla `perfil` + Row Level Security                 |
| Integraciones externas       | Supabase Edge Functions (Deno)                                      |
| Pruebas                      | Vitest + Testing Library, Playwright                                |
| Calidad estática             | ESLint, Prettier, `tsc`                                             |
| CI                           | GitHub Actions                                                      |

Se evaluó Next.js y se descartó: el sistema no necesita renderizado en servidor ni SEO, y separar código de servidor y de cliente agrega complejidad al revisar el código.

## Consecuencias

- Un solo lenguaje (TypeScript) para la interfaz y la lógica del método.
- La seguridad descansa en RLS y en funciones `security definer`: deben probarse.
- Las Edge Functions (Deno) no importan `guios-core` (ver ADR-002).
