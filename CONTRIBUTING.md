# Cómo trabajamos

## Flujo: issue → rama → PR → main

1. **Issue**: cada unidad de trabajo es un issue con objetivo, alcance, criterios de aceptación y dependencias. Están agrupados por milestone (sprint) y etiquetados por área.
2. **Rama**: se crea desde `main` actualizado, con el número del issue:
   - `feat/<n>-descripcion` para funcionalidad
   - `fix/<n>-descripcion` para correcciones
   - `docs/<n>-descripcion` para documentación
3. **Commits** con [Conventional Commits](https://www.conventionalcommits.org/es/):
   `feat(evaluaciones): valorar subfactores (#8)`
4. **PR** hacia `main` usando la plantilla. La descripción incluye `Closes #<n>` para que el issue se cierre al hacer merge.
5. **CI** (GitHub Actions): lint, formato, tipos, pruebas con cobertura y build. Si falla, no se hace merge.
6. **Revisión y merge**: se revisa el PR, se hace merge y se borra la rama.

`main` está protegida: todo entra por PR con la CI en verde.

## Orden de los issues

No empezar un issue hasta que sus dependencias (`Depende de`) estén en `main`.

| Milestone                      | Issues                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| Sprint 0 · Base                | #1                                                                                  |
| Sprint 1 · Catálogo y factores | #2 guios-core · #3 BD + RLS · #4 semilla · #5 auth · #6 componentes · #7 P-02..P-04 |
| Sprint 2 · Evaluación completa | #8 P-05/P-06 · #9 E2E piloto                                                        |
| Sprint 3 · IS con IA           | #10 Edge Functions · #11 IL/IS y publicación · #12 documentación                    |
| Publicación                    | #13 Supabase + Vercel                                                               |

## Reglas que no se negocian

- La lógica del método vive **solo** en `src/guios-core/` y no importa nada de fuera (lo verifica ESLint).
- No se alteran las reglas RN-01..RN-08 de la tesis. Si `BRIEF.md` contradice a la tesis, manda la tesis.
- Toda regla del método se escribe **test primero** con los golden tests de `BRIEF.md` §6.
- Ninguna clave secreta se sube al repositorio. Solo las variables `VITE_` llegan al navegador.

## ClickUp

Cada tarea de ClickUp enlaza su issue y su PR. Al hacer merge, la tarea pasa a **Done**.
