# ADR-002: Quién calcula qué

- **Estado**: aceptada
- **Fecha**: 17/11/2026

## Contexto

La lógica del método debe vivir en un solo lugar (RNF-07) y no conocer la base de datos ni la interfaz (BRIEF §8.2).

## Decisión (BRIEF §8.3)

- **Evaluaciones**: `guios-core` corre en el navegador. Cada cambio guarda la entrada (ID, alcance, PS) y los derivados (IR, relevancia, PM, FODA). **Finalizar** guarda la recomendación, el texto y las causas y cambia el estado. RLS asegura que un usuario solo escriba sus propias evaluaciones.
- **Recálculo de IS**: las Edge Functions buscan, clasifican y guardan referencias. El conteo `c_i` sale de una consulta SQL. IL e IS las calcula `guios-core` en el navegador del administrador y las guarda la función SQL `guardar_resultado_calculo` (solo administradores).
- Las Edge Functions **no** importan `guios-core`, para no compartir código entre Vite y Deno.

## Consecuencias

- Un usuario malintencionado solo podría alterar sus propias evaluaciones.
- La interfaz usa el mismo módulo para vistas previas y para la fotografía final.
- El recálculo por pasos con Edge Functions está en [ADR-004](ADR-004-recalculo-por-pasos.md); lo que la base garantiza sobre el cálculo, en [ADR-005](ADR-005-ciclo-de-vida-del-calculo.md); el guardado de las evaluaciones, en [ADR-008](ADR-008-evaluacion-autoguardado-y-fotografia.md).
