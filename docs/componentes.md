# Componentes base del CP1

Estilos y componentes visuales del Componente Práctico 1 (issue #6). La referencia es `docs/fuentes/GUIOS_PRO_2.0_prototipo.html` (BRIEF §12.1).

## Reglas

- `src/components/` solo recibe **props y emite eventos**: sin Supabase, sin consultas y sin lógica del método. Solo importa **tipos y textos de escala** de `guios-core` (`Foda`, `IMPORTANCIA`).
- Los componentes son controlados: el estado vive en la pantalla que los usa.
- **El color nunca va solo** (BRIEF §12.2): cada color de FODA, importancia o estado de la barra lleva el texto del nivel o de la clasificación.
- Valores numéricos con coma decimal (`3,25`), vía `formato.ts`.

## Estilos (`src/styles/`)

| Archivo           | Contenido                                                                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokens.css`      | Variables CSS del CP1 (BRIEF §12.3): `--navy`, `--orange`, `--bg`, `--text`, FODA (`--F`, `--O`, `--D`, `--A`), `--recB`, importancia `--l1`..`--l4`, tamaños 22/14/12 px, radio 12 px, fuente Inter |
| `componentes.css` | Estilos de los componentes, impresión (`@media print`) y versión móvil (`@media (max-width: 760px)`)                                                                                                 |
| `global.css`      | Reinicio, fuente Inter e importación de los dos anteriores (cargado desde `src/main.tsx`)                                                                                                            |

El punto de quiebre móvil es **760 px**: aparece la barra de navegación inferior, el stepper se reduce a «Paso n de N» y la matriz FODA pasa a una columna doble sin rótulos de eje.

## Componentes

| Componente          | Props principales                                                                                                                                                             | Eventos                                                  | Accesibilidad                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SegmentedSelector` | `etiqueta`, `opciones`, `valor`, `variante` (`neutra`, `importancia`, `cumplimiento`), `deshabilitado`                                                                        | `onCambiar(valor)`                                       | `radiogroup`; un clic selecciona; Tab entra en la opción activa; flechas, Inicio y Fin mueven y seleccionan; Enter y Espacio activan                                                      |
| `FodaChip`          | `foda` (o «Sin evaluar»)                                                                                                                                                      | —                                                        | El texto acompaña al color                                                                                                                                                                |
| `FodaMatrix`        | `factores` (`id`, `nombre`, `foda`, `ir`, `pm`), `textoVacio`                                                                                                                 | `onSeleccionarFactor(id)`                                | Grupo «Matriz FODA»; cuadrantes como regiones con conteo; factores son botones solo si hay manejador (ir del factor a sus subfactores)                                                    |
| `PmBar`             | `valor`, `umbral` (3), `parcial`, `foda`, `variante` (`detalle`, `compacta`), `nombre`                                                                                        | —                                                        | `meter` con `aria-valuetext` que dice el valor, el umbral y la clasificación                                                                                                              |
| `ProgressRing`      | `completados`, `total`, `etiqueta`                                                                                                                                            | —                                                        | `progressbar` con «n de N (x %)»                                                                                                                                                          |
| `Stepper`           | `pasos` (`id`, `titulo`, `subtitulo`, `completado`, `habilitado`), `actual`                                                                                                   | `onIrAPaso(id)`                                          | `aria-current="step"`; «completado» como texto; pasos futuros deshabilitados; versión móvil con barra de avance                                                                           |
| `BottomBar`         | `etiquetaPrincipal`, `etiquetaSecundaria`, `principalDeshabilitado`, `secundariaDeshabilitada`, `atrasDeshabilitado`, `children`                                              | `onAtras`, `onSecundaria`, `onPrincipal`                 | Región «Acciones del paso»; los botones omitidos no se dibujan                                                                                                                            |
| `Layout`            | `usuario`, `navegacion`, `navegacionMovil`, `accionesCabecera`, `barraInferior`, `subtituloMarca`                                                                             | —                                                        | Enlace «Saltar al contenido», `banner`, `main`, dos `navigation` («Principal» y «Principal (móvil)»)                                                                                      |
| `AyudaContextual`   | `etiqueta`, `texto`                                                                                                                                                           | —                                                        | Botón «?» con descripción; Escape la cierra; sirve para explicar la IS (IE, IL y cálculo vigente)                                                                                         |
| `FactorFila`        | `nombre`, `totalSubfactores`, `alcance`, `alcanceEditable`, `importanciaSugerida`, `ayudaSugerida`, `importanciaDecisor`, `importanciaRelativa`, `relevante`, `deshabilitado` | `onCambiarImportancia(valor)`, `onCambiarAlcance(valor)` | Dos `radiogroup` («Importancia del factor X» y, solo en Soporte, «Alcance del factor X»); la IS lleva `AyudaContextual`; la relevancia se dice con texto («● Relevante» / «○ Se excluye») |
| `HistorialTabla`    | `filas` (`id`, `titulo`, `detalle`, `organizacion`, `fecha`, `estado`, `avance`, `recomendacion`), `textoVacio`                                                               | `onAbrir(id)`                                            | Tabla con encabezados de columna; estado y recomendación con texto; cada botón se nombra con su evaluación («Continuar «título»»); en móvil cada fila pasa a tarjeta                      |

## Decisiones de diseño

- **Fuente Inter** se carga desde Google Fonts, como en el prototipo; si no está disponible se usa la fuente del sistema. Alojarla localmente queda como mejora opcional (implicaría una dependencia o un archivo de fuente).
- Las descripciones de las opciones del `SegmentedSelector` van fuera de los botones para no alterar su nombre accesible.
- `FodaMatrix` ordena los cuadrantes como el prototipo: fila interna (Fortalezas, Debilidades) y fila externa (Oportunidades, Amenazas).
- Pruebas: Testing Library con `userEvent` (un clic, teclado, estados deshabilitados y texto visible), junto a cada componente (`*.test.tsx`).
