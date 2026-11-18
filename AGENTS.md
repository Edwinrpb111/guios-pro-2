# Instrucciones para agentes de IA

Leé esto antes de modificar el repositorio.

1. **Fuente de verdad**: `BRIEF.md`. Si contradice a la tesis, manda la tesis. Las reglas RN-01..RN-08 no se modifican.
2. **Trabajá un issue a la vez**: rama `feat/<n>-descripcion` desde `main`, un PR por issue con `Closes #<n>`, usando la plantilla de PR. Respetá el campo "Depende de" del issue.
3. **`src/guios-core/` es TypeScript puro**: no importa React, Supabase ni archivos fuera de la carpeta. Las reglas se escriben test primero con los fixtures de `BRIEF.md` §6; cobertura ≥ 95 %.
4. **`src/components/`** solo recibe props y emite eventos: sin acceso a Supabase ni lógica del método.
5. **Antes de abrir un PR** corré `npm run check` y que pase completo.
6. **Secretos**: nunca escribas claves en el código ni en archivos versionados; usá `.env.local` (ignorado por Git); la lista de variables está en `docs/variables-entorno.md`.
7. **Idioma**: código, identificadores y documentación en español, como el dominio de la tesis. Commits con Conventional Commits.
