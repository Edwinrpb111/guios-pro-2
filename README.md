# GUIOS PRO 2.0

Sistema web para evaluar si un software libre (FLOSS) es adecuado para una organización, basado en la guía **GUIOS** de la tesis doctoral de Rea Sánchez (2022). El decisor valora 18 factores y 61 subfactores; el sistema clasifica cada factor con un enfoque FODA y emite una recomendación de adopción **A, B o C**.

UNEMI · Ingeniería de Software · Procesos y Calidad de Software · 2026.

**En línea:** <https://guios-pro-2.vercel.app>

> La especificación completa está en [`BRIEF.md`](BRIEF.md). El reparto del trabajo y el proceso, en [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Stack

React 18 + TypeScript estricto + Vite · React Router · TanStack Query · Supabase (PostgreSQL, Auth, RLS, Edge Functions) · Vitest + Testing Library · Playwright · GitHub Actions · Vercel. Ver [ADR-001](docs/decisiones/ADR-001-stack.md).

## Requisitos

- Node.js 22 o superior y npm.
- Docker Desktop, encendido (Supabase local corre en contenedores).
- Deno 2 (solo para probar las Edge Functions: `npm run test:functions`).

## Cómo levantarlo en local

1. **Instalar dependencias** (incluye la CLI de Supabase):

   ```bash
   npm install
   ```

2. **Levantar Supabase local** (la primera vez descarga las imágenes de Docker):

   ```bash
   npx supabase start
   ```

   Al terminar muestra la _API URL_ (`http://127.0.0.1:54321`), la _anon key_ y la URL de Studio (`http://127.0.0.1:54323`). Se vuelven a ver con `npx supabase status`.

3. **Crear la base con el catálogo y el cálculo de la tesis.** Aplica las migraciones de `supabase/migrations/` y la semilla `supabase/seed.sql` (3 dimensiones, 18 factores, 61 subfactores y la IS de la tesis como cálculo vigente):

   ```bash
   npm run db:reset
   ```

4. **Configurar las variables del navegador.** Crea a mano el archivo `.env.local` en la raíz (Git lo ignora; nunca se versiona) con las dos variables `VITE_` descritas en [`docs/variables-entorno.md`](docs/variables-entorno.md):

   ```
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=<la anon key que muestra `npx supabase status`>
   ```

5. **Arrancar la aplicación:**

   ```bash
   npm run dev        # http://localhost:5173
   ```

6. **Registrarse en la app** (`/login` → «Crear cuenta»). En local el correo no se confirma, así que se entra de inmediato como **decisor**. Para recalcular la importancia sugerida hace falta un administrador: ver [Administrador inicial](#administrador-inicial).

Para probar el recálculo de IS en local (pantallas `/admin/sugerida`) hay que servir además las Edge Functions con `npx supabase functions serve`; en local usan proveedores falsos (`LLM_PROVIDER=fake`), sin red ni claves. Detalles en [`docs/edge-functions.md`](docs/edge-functions.md).

Para apagar todo: `npx supabase stop`.

### Pruebas

- `npm run check` ejecuta lo mismo que la CI (lint, formato, tipos, pruebas con cobertura y build).
- `npm run test:db` ejecuta las pruebas de RLS y funciones SQL contra la base local.
- `npm run test:functions` ejecuta las pruebas de las Edge Functions (Deno).
- Prueba E2E del piloto de la tesis (LibreOffice → recomendación C): [`docs/pruebas-e2e.md`](docs/pruebas-e2e.md).

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
| `npm run test:functions`          | Pruebas de las Edge Functions (Deno; proveedores falsos)    |
| `npm run typecheck:functions`     | Verificación de tipos de las Edge Functions (Deno)          |

### Prueba de integración de autenticación

`src/lib/auth.integracion.test.ts` registra un usuario, lee su `perfil`, cierra e inicia sesión contra Supabase local. Se omite si no están definidas las variables `SUPABASE_URL_PRUEBAS` y `SUPABASE_ANON_KEY_PRUEBAS` (por eso la CI no la ejecuta). Con Supabase local arriba:

```bash
SUPABASE_URL_PRUEBAS=http://127.0.0.1:54321 SUPABASE_ANON_KEY_PRUEBAS=<anon key de `npx supabase status`> npx vitest run src/lib/auth.integracion.test.ts
```

Cada ejecución deja un usuario `prueba-<uuid>@example.com` en la base local; se descarta con `npm run db:reset`.

## Administrador inicial

La semilla no crea usuarios (no hay contraseñas en el repositorio). El administrador se registra en la app como cualquier usuario, queda como `decisor`, y después se le **promueve** a mano.

El cliente **no puede** subirse el rol: por la decisión de [ADR-003](docs/decisiones/ADR-003-esquema-supabase.md), `authenticated` solo tiene permiso para actualizar `nombre_completo` e `id_organizacion` de su `perfil`, así que cambiar `rol` desde la app o con la clave pública falla. La promoción se hace con el rol de base de datos (`postgres`), desde el editor SQL:

1. Registra al administrador en la app con el correo que tendrá (el valor de `ADMIN_EMAIL`, ver [`docs/variables-entorno.md`](docs/variables-entorno.md)).
2. Abre el editor SQL: en local, Studio (`http://127.0.0.1:54323`) → _SQL Editor_; en el proyecto hospedado, el _SQL Editor_ del panel de Supabase.
3. Ejecuta, con el correo real:

   ```sql
   update public.perfil set rol = 'administrador'
   where id = (select id from auth.users where email = '<ADMIN_EMAIL>');
   ```

   Debe responder una fila actualizada; si responde cero, el correo no coincide con ningún usuario registrado.

4. Esa persona **cierra sesión y vuelve a entrar** (el rol se lee al iniciar la sesión). Ahora ve «Importancia sugerida» en el menú y puede abrir `/admin/sugerida`.

Para quitarle el rol, el mismo `update` con `'decisor'`.

## Edge Functions del recálculo de IS

`recalculo-iniciar` y `recalculo-paso` (solo administradores) buscan en OpenAlex y Crossref y clasifican con Gemini. En local usan `LLM_PROVIDER=fake`, sin red ni claves. Contrato, errores, pausa y reanudación, y cómo probarlas: [`docs/edge-functions.md`](docs/edge-functions.md).

## Estructura

```
src/
├─ guios-core/   # Lógica del método, TypeScript puro (no importa React ni Supabase)
├─ lib/          # Cliente Supabase y tipos generados
├─ datos/        # Repositorio: acceso a Supabase de las pantallas del decisor
├─ components/   # Componentes visuales (solo props y eventos)
├─ pages/        # Pantallas P-01..P-11
├─ auth/         # Sesión, rol y guardas de rutas
├─ evaluacion/   # Derivados, pasos, historial y guardado de una evaluación
├─ admin/        # Recálculo de IS (P-08..P-10)
└─ styles/       # Tokens y estilos del CP1
supabase/        # Migraciones, semilla, pruebas pgTAP y Edge Functions
docs/
├─ decisiones/   # ADR (ver abajo)
├─ fuentes/      # Datos y prototipo de referencia (catálogo CSV, prototipo HTML del CP1, PNG)
└─ *.md          # Documentación por tema (ver abajo)
```

## Documentación

| Documento                                                | Contenido                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| [`BRIEF.md`](BRIEF.md)                                   | Especificación completa (fuente de verdad)                      |
| [`docs/variables-entorno.md`](docs/variables-entorno.md) | Variables del navegador, de las pruebas y de las Edge Functions |
| [`docs/componentes.md`](docs/componentes.md)             | Componentes base del CP1                                        |
| [`docs/evaluacion.md`](docs/evaluacion.md)               | Flujo de una evaluación: subfactores, resultados e informe      |
| [`docs/recalculo.md`](docs/recalculo.md)                 | Recálculo de la importancia sugerida: IL, IS y publicación      |
| [`docs/edge-functions.md`](docs/edge-functions.md)       | Contrato y pruebas de las Edge Functions                        |
| [`docs/ayuda-metodo.md`](docs/ayuda-metodo.md)           | Ayuda del método (P-11)                                         |
| [`docs/pruebas-e2e.md`](docs/pruebas-e2e.md)             | Prueba E2E del piloto de la tesis                               |

### Decisiones de arquitectura (ADR)

| ADR                                                                     | Decisión                                                    |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| [001](docs/decisiones/ADR-001-stack.md)                                 | Stack: React + Vite + Supabase + Vercel, sin backend propio |
| [002](docs/decisiones/ADR-002-donde-se-calcula.md)                      | Quién calcula qué: `guios-core` en el navegador             |
| [003](docs/decisiones/ADR-003-esquema-supabase.md)                      | Esquema de la base, RLS y privilegios por columna           |
| [004](docs/decisiones/ADR-004-recalculo-por-pasos.md)                   | Recálculo de la IS en pasos cortos con Edge Functions       |
| [005](docs/decisiones/ADR-005-ciclo-de-vida-del-calculo.md)             | Ciclo de vida del cálculo de IS garantizado por la base     |
| [006](docs/decisiones/ADR-006-catalogo-y-semilla.md)                    | Catálogo y cálculo de la tesis como semilla generada        |
| [007](docs/decisiones/ADR-007-autenticacion-y-roles.md)                 | Autenticación, rol y guardas de rutas                       |
| [008](docs/decisiones/ADR-008-evaluacion-autoguardado-y-fotografia.md)  | Autoguardado, derivados guardados y fotografía al finalizar |
| [009](docs/decisiones/ADR-009-capas-del-frontend-y-ayuda-del-metodo.md) | Capas del frontend y ayuda del método como modal global     |

## Despliegue

Producción (issue #13): frontend en Vercel (<https://guios-pro-2.vercel.app>, rama `main`) y proyecto de Supabase `gnqkijgzeswsyzwjsifu` (us-east-1). Pasos para repetirlo en otro proyecto:

1. **Supabase (proyecto hospedado):**
   - Crear el proyecto y enlazarlo: `npx supabase link --project-ref <ref>`.
   - Aplicar las migraciones y, solo en una base nueva, la semilla: `npx supabase db push --remote --include-seed` (probar antes con `--dry-run`). En las siguientes publicaciones, `npx supabase db push --remote` sin `--include-seed`.
   - Definir los secretos de las Edge Functions (`npx supabase secrets set NOMBRE=valor`; la lista está en [`docs/variables-entorno.md`](docs/variables-entorno.md)), con `LLM_PROVIDER=gemini` y `ORIGENES_PERMITIDOS` igual a la URL de Vercel, y publicar las funciones: `npx supabase functions deploy`.
   - Revisar en Authentication la política de contraseñas y la confirmación de correo, y añadir la URL de Vercel a las URL permitidas.
   - Promover al primer administrador ([Administrador inicial](#administrador-inicial)).
2. **Vercel (frontend):**
   - Importar el repositorio como proyecto Vite (build `npm run build`, salida `dist`; `vercel.json` ya redirige todas las rutas a `index.html`).
   - Definir `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores del proyecto hospedado. Nunca van claves secretas en Vercel.
   - Con el repositorio conectado, cada push a `main` despliega. Sin conectar: `npx vercel deploy --prod`.
3. **Comprobar:** registrarse, crear una evaluación y, como administrador, abrir `/admin/sugerida`.
