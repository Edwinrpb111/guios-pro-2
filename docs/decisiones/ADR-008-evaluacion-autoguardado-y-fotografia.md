# ADR-008: Evaluación con autoguardado, derivados guardados y fotografía al finalizar

- **Estado**: aceptada
- **Fecha**: 18/11/2026
- **Issues**: #7, #8

## Contexto

El piloto de la tesis tardó 25 minutos con un deslizador, una lista y un botón de guardar por subfactor (BRIEF §12.2). RNF-06 exige no perder datos ante cierres, y una evaluación terminada debe seguir diciendo lo mismo aunque cambie el cálculo de IS o el método (trampa 9, BRIEF §5.9).

## Decisión

- **Autoguardado como borrador en cada cambio, en serie.** El cambio se aplica al instante en pantalla y se encola (`useColaDeGuardado`): las escrituras llegan a la base en el orden en que se hicieron y un fallo avisa y revierte ese valor, sin detener la cola. El estado de guardado es siempre visible.
- **Se guardan entradas y derivados.** Cada cambio guarda la entrada (ID, alcance, PS) y los derivados (IR, relevancia, PM, FODA) calculados con `guios-core` en el navegador (ADR-002). `src/evaluacion/derivar.ts` arma las entradas del núcleo y presenta sus resultados; ninguna pantalla repite una regla.
- **Un clic por subfactor, todos visibles** (`SubfactorFila`), y desde la matriz FODA se va del factor a sus subfactores (BRIEF §12.2).
- **PM parcial sin FODA.** Mientras faltan subfactores se muestra la media de los ya valorados marcada «(parcial)» y sin clasificación; el factor sigue «pendiente» y no cuenta para la recomendación (RN-06).
- **Finalizar es la única acción que congela.** Vuelve a guardar la fotografía de todos los factores con importancia asignada y, en un `update` condicionado a `estado = 'en_curso'`, guarda `codigo_recomendacion`, `texto_recomendacion` (texto completo de la tesis) y `causas`. Con la evaluación finalizada, RLS rechaza cualquier escritura (ADR-003).
- **Una evaluación finalizada muestra lo guardado**, no lo que se derivaría hoy. La evaluación nace con el `id_calculo` vigente y no lo cambia.
- **Resultados se puede abrir con factores pendientes** (basta con que todos los factores tengan importancia asignada), para que el caso «factor sin terminar: se excluye y los demás deciden» sea visible; al finalizar se avisa de lo que quedará excluido.
- **El informe PDF es una vista de impresión** (`/evaluaciones/:id/informe`, `@media print` y `window.print()`): sin servidor ni dependencias (BRIEF §8.1). Un borrador se puede imprimir rotulado «Borrador».

## Consecuencias

- Un usuario que manipule la entrada solo altera su propia evaluación (RLS), y el texto guardado no cambia si más adelante se modifica `textos.ts`.
- El orden estricto de la cola evita que un guardado viejo pise a uno nuevo.
- Detalle de pantallas y casos borde: [`docs/evaluacion.md`](../evaluacion.md).
