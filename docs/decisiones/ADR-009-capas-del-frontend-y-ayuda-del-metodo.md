# ADR-009: Capas del frontend y ayuda del método como modal global

- **Estado**: aceptada
- **Fecha**: 18/11/2026
- **Issues**: #1, #6, #7, #8, #12

## Contexto

RNF-07 pide lógica separada de la interfaz y cubierta por pruebas. Con varios issues en paralelo, la separación tiene que estar escrita y, donde se pueda, impuesta por herramientas.

## Decisión

Capas con dependencias en un solo sentido:

| Capa                                                    | Puede depender de                           | No puede                                        |
| ------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| `src/guios-core/`                                       | nada fuera de la carpeta (lo impone ESLint) | importar React ni Supabase                      |
| `src/components/`                                       | tipos y textos de escala de `guios-core`    | consultar Supabase ni aplicar reglas del método |
| `src/datos/` (repositorio) y `src/admin/apiSupabase.ts` | `src/lib/` (cliente y tipos generados)      | decidir cómo se presenta algo                   |
| `src/pages/`, `src/evaluacion/`, `src/admin/`           | todas las anteriores                        | repetir una regla del método                    |

Solo la primera fila la verifica ESLint (`no-restricted-imports`); las demás se cuidan en la revisión (AGENTS.md, puntos 3 y 4).

- **Los componentes son controlados**: reciben props y emiten eventos; el estado vive en la pantalla.
- **El repositorio es la única capa que habla con Supabase** desde las pantallas del decisor (`crearRepositorio(cliente)` recibe el cliente para probarlo contra Supabase local). Las pruebas de pantallas usan un repositorio falso (`src/test/datos.ts`). Las pantallas de administración usan su propio acceso (`src/admin/apiSupabase.ts`) con la misma idea.
- **TanStack Query** para lectura e invalidación (historial, catálogo, cálculo vigente); el guardado en serie va aparte (ADR-008).
- **El color nunca va solo**: FODA, importancia y estados siempre llevan texto (BRIEF §12.2).
- **Ayuda del método (P-11) como modal global.** Un botón «Ayuda del método» vive en la cabecera de las pantallas del decisor (`MarcoDecisor`) y de administración (`MarcoAdmin`) y abre un diálogo modal accesible (`VentanaModal`: foco atrapado, Escape y clic en el fondo cierran, devuelve el foco). El contenido (`AyudaMetodoContenido`) solo presenta lo que recibe; el conector `src/pages/AyudaMetodo.tsx` toma de `guios-core` los nombres de los niveles, los umbrales y los textos de las recomendaciones, de modo que la ayuda no puede contradecir al método. No tiene ruta propia: es un modal, como pide BRIEF §12.1. La ayuda por campo (la IS y su origen) sigue siendo `AyudaContextual`.

## Consecuencias

- Cambiar un umbral o un texto de recomendación en `guios-core` actualiza la ayuda sin tocar la interfaz.
- La pantalla de ingreso no ofrece la ayuda: no hay sesión y el método no se aplica ahí.
- Los textos propios de la ayuda (glosario y explicaciones) viven en `AyudaMetodoContenido` y se prueban con Testing Library; si cambia una regla, hay que revisar esa redacción. Ver [`docs/ayuda-metodo.md`](../ayuda-metodo.md).
