# Flujo de una evaluación: subfactores, resultados e informe (P-05, P-06)

Pantallas del issue #8 (HU-04, HU-05, HU-06, HU-12, HU-15). Siguen el flujo de BRIEF §8.4: `Contexto → Factores → Subfactores → Resultados`, con autoguardado en cada cambio y **Finalizar** como único paso que congela la evaluación.

| Pantalla | Ruta                                        | Qué hace                                                                                                              |
| -------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| P-05     | `/evaluaciones/:id/subfactores?factor=<id>` | Un clic por subfactor, todos visibles; lista de factores relevantes con su avance; PM en vivo y FODA al completar     |
| P-06     | `/evaluaciones/:id/resultados`              | Matriz FODA, recomendación A/B/C con sus causas, factores pendientes y **Finalizar**                                  |
| Informe  | `/evaluaciones/:id/informe`                 | Documento imprimible (`@media print` en `src/styles/informe.css`; «Imprimir o guardar como PDF» usa `window.print()`) |

## Dónde vive cada cosa

- **Reglas del método**: solo en `src/guios-core/` (`evaluarFactor`, `ponderacionMedia`, `clasificarFoda`, `recomendar`, textos de §4.4). `src/evaluacion/derivar.ts` arma sus entradas y presenta sus resultados; ninguna pantalla ni componente repite una regla.
- **Guardado**: `useValoracionFactores` (hook compartido con P-04) aplica el cambio al instante y lo encola en la cola de guardados en serie. `cambiarCumplimiento` guarda con `repositorio.guardarValoracionSubfactor`, que hace _upsert_ de la fila del factor (con su PM y FODA recalculados) y luego del PS del subfactor. Si falla, se avisa y se vuelve al valor anterior.
- **Finalizar**: `useFinalizarEvaluacion` → `repositorio.finalizarEvaluacion`. Vuelve a guardar la fotografía de **todos los factores con importancia asignada** (IR, PM, FODA recalculados) y, en un `update` con `estado = 'en_curso'` como condición, guarda `estado = 'finalizada'`, `codigo_recomendacion`, `texto_recomendacion` y `causas` (`[{factor, foda, ir}]`, ADR-003 ajuste 11). Con la evaluación finalizada, RLS rechaza cualquier escritura: ni subfactores ni una segunda finalización (lo comprueba `repositorio.integracion.test.ts`).
- **Fotografía**: una evaluación finalizada muestra la recomendación **guardada** (código, texto y causas), no la que se derivaría hoy (BRIEF §5.9).

## Eliminar desde el historial (P-02, issue #32)

- **Qué se puede eliminar**: solo las evaluaciones propias **en curso** (borradores, también los «Evaluación sin título»). Una finalizada no se modifica ni se borra (BRIEF §10.3): su fila no ofrece «Eliminar» (`sePuedeEliminar` en `src/evaluacion/historial.ts`).
- **Quién lo garantiza**: la política `evaluacion: borrar en curso` de `20261117000002_rls.sql` (dueño y `estado = 'en_curso'`); no hizo falta una migración nueva. Las valoraciones de factores y los PS se borran con el `ON DELETE CASCADE` del esquema; el software, la organización, el catálogo y los cálculos de IS no se tocan. Lo fija `supabase/tests/eliminar_evaluacion.test.sql` (pgTAP).
- **Flujo**: «Eliminar «título»» en la fila → `VentanaModal` «Eliminar evaluación» que nombra la evaluación y avisa que no se puede deshacer → «Sí, eliminar» llama a `useEliminarEvaluacion` → `repositorio.eliminarEvaluacion`. Al confirmarse, la fila desaparece del historial y de los contadores y se relee el historial.
- **Si falla** (sin red, ajena, ya borrada o finalizada: RLS no devuelve filas y el repositorio lo trata como error), el diálogo sigue abierto con el motivo (`role="alert"`) y la fila sigue en el historial.

## Casos borde de la recomendación (BRIEF §6.4) en la interfaz

| Situación                                     | Qué se ve                                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Ningún factor evaluado                        | «Sin recomendación» y **Finalizar** deshabilitado                                                                                 |
| Todos los evaluados son F u O                 | Recomendación A, sin causas                                                                                                       |
| Una única Debilidad con IR = 2                | Recomendación B con esa causa                                                                                                     |
| Una Amenaza IR 2 y una Debilidad IR 4         | Recomendación C; solo la Debilidad figura como causa                                                                              |
| Factor relevante con un subfactor sin valorar | Aparece en «Factores pendientes» («falta 1 subfactor; no cuenta para la recomendación»), no entra en la matriz; los demás deciden |
| PM = 3,00 exacto en un factor externo         | Oportunidad (se clasifica con la PM sin redondear)                                                                                |

## Decisiones

- **Los resultados se pueden abrir con factores pendientes** (paso «Resultados» habilitado cuando todos los factores tienen importancia asignada). Si solo se habilitara con todos los subfactores completos, el caso «se excluye; los demás deciden» no podría verse. Al finalizar con pendientes, la confirmación avisa de que quedarán excluidos.
- **PM en vivo parcial**: mientras faltan subfactores se muestra la media de los ya valorados (calculada con `ponderacionMedia` de `guios-core`) marcada «(parcial)» y **sin FODA**; el factor sigue «pendiente» (RN-06).
- **Texto guardado**: `texto_recomendacion` guarda el texto completo de la tesis (§4.4); el título se obtiene del código.
- **Informe de un borrador**: se puede abrir con la evaluación en curso y se rotula «Borrador».
