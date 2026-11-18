# Ayuda del método (P-11)

Pantalla P-11 de BRIEF §12.1 («Ayuda del método», modal global) y parte de HU-11 (ayudas contextuales) y RNF-02 (un usuario nuevo completa una evaluación sin capacitación). Issue #12.

## Cómo se usa

- El botón **«Ayuda del método»** (`?`) está en la cabecera de todas las pantallas con sesión: las del decisor (P-02..P-06 e informe) lo tienen en la barra superior, y las de administración (P-08, P-09) junto al título.
- Abre un diálogo modal con el nombre «Ayuda del método GUIOS». Se cierra con **Escape**, con el botón «Cerrar» o con un clic fuera del diálogo, y el foco vuelve al botón que lo abrió. Mientras está abierto, el foco no sale del diálogo.
- No tiene ruta propia ni cambia la evaluación en curso: se puede abrir y cerrar en cualquier momento sin perder lo guardado.
- La pantalla de ingreso (P-01) no la ofrece: no hay sesión.
- En móvil (≤ 760 px) el diálogo se ancla abajo, ocupa todo el ancho y se desplaza por dentro.

## Qué contiene

| Sección                                | Qué explica                                                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿Qué evalúa GUIOS?                     | 18 factores en tres dimensiones, 61 subfactores, clasificación FODA y recomendación A, B o C; todo se guarda solo                                                 |
| Importancia: de dónde sale cada valor  | Glosario de IE, IL, IS, ID e IR (la IS sale del cálculo vigente) y la escala de importancia 1..4 con su nombre                                                    |
| Qué factores se evalúan                | Un factor se evalúa si su importancia relativa supera el nivel «Irrelevante»; Soporte se evalúa con el alcance que se elija                                       |
| Cumplimiento de los subfactores        | Las cuatro opciones de cumplimiento con su número y nombre; un factor con subfactores sin valorar queda pendiente                                                 |
| Ponderación media y clasificación FODA | La PM como promedio de los subfactores, el umbral de favorable y la clasificación (Fortaleza o Debilidad en alcance interno; Oportunidad o Amenaza en el externo) |
| La recomendación A, B o C              | Título y texto de las tres recomendaciones, tal como los usan los resultados y el informe                                                                         |

El color nunca va solo: todo nivel y toda clasificación aparecen con su nombre.

## De dónde salen los textos

Para no duplicar el método, **nada de lo que depende de una regla se escribe en la interfaz**:

- Los nombres y números de las escalas salen de `IMPORTANCIA` y `CUMPLIMIENTO` (`src/guios-core/escalas.ts`).
- Los umbrales (relevancia y FODA) salen de `UMBRAL_RELEVANCIA` y `UMBRAL_FODA` (`src/guios-core/reglas.ts`); si cambian, la ayuda cambia sola.
- Los títulos y textos de A, B y C salen de `TEXTOS_RECOMENDACION` (`src/guios-core/textos.ts`), los mismos que muestran los resultados.
- Lo único que se redacta en la interfaz es la explicación en prosa y el glosario (`AyudaMetodoContenido`). La prosa no repite números ni condiciones de la recomendación: remite a los textos de la tesis. Si cambia una regla, hay que revisar esa redacción.

## Dónde está en el código

| Pieza                        | Archivo                                                  | Responsabilidad                                                    |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| `VentanaModal`               | `src/components/VentanaModal.tsx`                        | Diálogo modal accesible y genérico (props y eventos)               |
| `AyudaMetodoContenido`       | `src/components/AyudaMetodoContenido.tsx`                | Contenido de la ayuda; solo presenta lo que recibe                 |
| `AyudaMetodo`                | `src/pages/AyudaMetodo.tsx`                              | Botón de cabecera; toma niveles, umbrales y textos de `guios-core` |
| `MarcoDecisor`, `MarcoAdmin` | `src/pages/MarcoDecisor.tsx`, `src/admin/MarcoAdmin.tsx` | Lo montan en la cabecera                                           |

Pruebas (Testing Library): `VentanaModal.test.tsx` (foco, teclado, clic en el fondo, lectores de pantalla), `AyudaMetodoContenido.test.tsx` (secciones y escalas), `AyudaMetodo.test.tsx` (apertura, textos de `guios-core`, foco al cerrar) y los de `MarcoDecisor` y `AdminSugeridaPage` (el botón está en las cabeceras). La decisión está en [ADR-009](decisiones/ADR-009-capas-del-frontend-y-ayuda-del-metodo.md).

## Ayudas contextuales relacionadas

`AyudaContextual` (el «?» junto a un campo) sigue explicando cosas puntuales, por ejemplo de dónde sale la IS de un factor (IE, IL y cálculo vigente, BRIEF §12.2). La ayuda del método es la vista general; ambas usan las mismas palabras.
