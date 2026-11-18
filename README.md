# GUIOS PRO 2.0

Sistema web para evaluar si un software libre (FLOSS) es adecuado para una organización, basado en la guía **GUIOS** de la tesis doctoral de Rea Sánchez (2022). El decisor valora 18 factores y 61 subfactores; el sistema clasifica cada factor con un enfoque FODA y emite una recomendación de adopción **A, B o C**.

UNEMI · Ingeniería de Software · Procesos y Calidad de Software · 2026.

> La especificación completa está en [`BRIEF.md`](BRIEF.md). El reparto del trabajo y el proceso, en [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Stack

React 18 + TypeScript estricto + Vite · React Router · TanStack Query · Supabase (PostgreSQL, Auth, RLS, Edge Functions) · Vitest + Testing Library · Playwright · GitHub Actions · Vercel. Ver [ADR-001](docs/decisiones/ADR-001-stack.md).

## Requisitos

- Node.js 22 o superior y npm.
- Docker Desktop (para Supabase local, desde el issue #3).

## Cómo levantarlo en local

```bash
npm install
npm run dev        # http://localhost:5173
```

Las variables de entorno están descritas en [`docs/variables-entorno.md`](docs/variables-entorno.md); se completan en un archivo local `.env.local` (ignorado por Git) cuando exista el proyecto de Supabase.

## Comandos

| Comando                           | Qué hace                                                    |
| --------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                     | Servidor de desarrollo                                      |
| `npm test`                        | Pruebas unitarias y de componentes                          |
| `npm run test:coverage`           | Pruebas con cobertura (exige ≥ 95 % en `src/guios-core/`)   |
| `npm run lint`                    | ESLint                                                      |
| `npm run format` / `format:check` | Prettier                                                    |
| `npm run typecheck`               | Verificación de tipos                                       |
| `npm run build`                   | Build de producción                                         |
| `npm run check`                   | Todo lo anterior, igual que la CI                           |
| `npx supabase start`              | Levanta Supabase local (necesita Docker Desktop)            |
| `npm run db:reset`                | Recrea la base local aplicando las migraciones y la semilla |
| `npm run db:semilla`              | Regenera `supabase/seed.sql` desde el CSV y la Tabla 5.3    |
| `npm run test:db`                 | Pruebas de RLS y funciones SQL (pgTAP) sobre la base local  |
| `npm run gen:types`               | Regenera `src/lib/database.types.ts` desde la base local    |

## Administrador inicial

La semilla no crea usuarios. El administrador se registra en la app como cualquier usuario (queda como `decisor`) y después se le sube el rol desde el editor SQL de Supabase, con el correo de `ADMIN_EMAIL`:

```sql
update public.perfil set rol = 'administrador'
where id = (select id from auth.users where email = '<ADMIN_EMAIL>');
```

## Estructura

```
src/
├─ guios-core/   # Lógica del método, TypeScript puro (no importa React ni Supabase)
├─ lib/          # Cliente Supabase, consultas y tipos generados
├─ components/   # Componentes visuales (solo props y eventos)
├─ pages/        # Pantallas P-01..P-11
└─ styles/       # Tokens y estilos del CP1
supabase/        # Migraciones, semilla y Edge Functions
docs/
├─ componentes.md # Componentes base del CP1 (props, eventos, accesibilidad)
├─ fuentes/      # Datos y prototipo de referencia (catálogo CSV, prototipo HTML del CP1, PNG)
└─ decisiones/   # ADR
```

## Despliegue

Es el último paso del proyecto (issue #13): Supabase para la base de datos y las Edge Functions, Vercel para el frontend.
