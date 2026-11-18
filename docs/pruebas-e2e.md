# Pruebas de punta a punta (E2E)

Recorren el **caso piloto LibreOffice–UNEMI** (BRIEF §6.3, issue #9) en un navegador real, contra Supabase local y contra la aplicación compilada. Es la prueba de aceptación del método: si no pasa, no se integra (RNF-01).

## Qué verifican

`e2e/piloto.spec.ts` hace, como lo haría una persona:

1. **Login** con un usuario recién creado (P-01).
2. **Contexto**: crea la evaluación y registra LibreOffice 7.6 para la Universidad Estatal de Milagro (P-03).
3. **ID de los 18 factores** y alcance **Interno** de Soporte (P-04).
4. **PS de los 61 subfactores**, con los valores de `pilot()` del CP1 (P-05).
5. **Resultados** (P-06):
   - La matriz FODA es **idéntica** a BRIEF §6.3: 7 Oportunidades, 4 Fortalezas, 4 Amenazas y 3 Debilidades, con los mismos factores.
   - La recomendación es **C**, causada por **Personalización** (Amenaza), **Formación** (Debilidad) y **Soporte** (Debilidad), todas con importancia relativa Importante.
6. **Finalizar** y recargar: la fotografía guardada en la base muestra lo mismo.

No duplica datos: lee los PS, las ID y los resultados esperados de `src/guios-core/fixtures/piloto_libreoffice.json` (solo lectura, el mismo fixture de los golden tests) y usa el catálogo y la importancia sugerida de `supabase/seed.sql`.

## Cómo correrlo en local

Requisitos: Node 22, Docker Desktop y `npm ci`.

```bash
npx supabase start          # migraciones y semilla; si la base ya existía: npm run db:reset
npx playwright install chromium   # solo la primera vez
npm run e2e
```

`npm run e2e` compila la app (`vite build`), la sirve con `vite preview` en `http://127.0.0.1:4173` y corre Playwright (solo Chromium). Para ver el navegador: `npx playwright test --headed`. Si falla, el rastro queda en `test-results/` (`npx playwright show-trace <trace.zip>`).

Si la base local no tiene la semilla (18 factores y un cálculo de IS vigente), la prueba falla al empezar con un mensaje que lo indica: corre `npm run db:reset`.

## Claves y usuario de prueba

La URL y las claves de Supabase local se leen, en este orden:

| Variable                            | Valor                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `SUPABASE_URL_PRUEBAS`              | `API_URL` de `npx supabase status -o env`                                                     |
| `SUPABASE_ANON_KEY_PRUEBAS`         | `ANON_KEY`; es la única que se compila en la app (`VITE_SUPABASE_ANON_KEY`)                   |
| `SUPABASE_SERVICE_ROLE_KEY_PRUEBAS` | `SERVICE_ROLE_KEY`; solo la usa Node para crear y borrar al usuario; nunca llega al navegador |

Si no están definidas, `e2e/entorno.ts` las toma de `npx supabase status -o env`; por eso en local no hace falta configurar nada. **Nunca se escriben en archivos versionados** (ver [`variables-entorno.md`](variables-entorno.md)).

Antes de la prueba se crea un usuario único (`e2e-<id>@guios.test`, correo ya confirmado) con la API de administración de Supabase; al terminar se borra, y sus evaluaciones caen en cascada. Así la prueba no depende de datos previos ni deja basura.

## En la CI

El trabajo **E2E del caso piloto (Playwright)** de `.github/workflows/ci.yml` es independiente del check requerido «Lint, tipos, pruebas y build». Instala el CLI de Supabase (`supabase/setup-cli`), levanta solo la base, la API y la autenticación, exporta las claves locales (enmascaradas en el registro), instala Chromium y ejecuta `npm run e2e`. Si falla, sube `playwright-report/` y `test-results/` como artefacto.

## Notas de mantenimiento

- Los selectores usan roles y etiquetas accesibles (`radiogroup` «Importancia del factor …», `region` «Recomendación», etc.), no clases CSS: un cambio de texto en la interfaz es el que rompe la prueba.
- `vitest` no corre estos archivos (`e2e/**` está excluido en `vite.config.ts`) y `npm run typecheck` los revisa con `e2e/tsconfig.json`.
- **De P-04 a P-05 sin recargar.** La E2E dejó al descubierto que P-05 partía de la evaluación en caché de P-04 y mostraba «Ningún factor es relevante» (issue #26). Se corrigió en `useEvaluacionCargada` (cada pantalla espera su propia lectura) y la prueba navega sin recargar, así que lo cubre de punta a punta.
