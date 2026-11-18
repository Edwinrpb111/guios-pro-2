# ADR-006: Catálogo y cálculo de la tesis como semilla generada

- **Estado**: aceptada
- **Fecha**: 18/11/2026
- **Issue**: #4

## Contexto

El sistema nace con el catálogo de GUIOS (3 dimensiones, 18 factores, 61 subfactores) y con el cálculo de IS de la tesis como cálculo vigente (BRIEF §10.4). Las fuentes disponibles se contradicen: `factors.csv` (prototipo original) tiene **2 IS que difieren de la tesis**, y `guiosad_data.csv` trae dos erratas de redacción (BRIEF §4.1, trampa 2).

## Decisión

- **`supabase/seed.sql` se genera, no se escribe a mano**: `npm run db:semilla` (`scripts/generar-semilla.ts`) lee los textos de `docs/fuentes/guiosad_data.csv` y toma NS, TC, IL e IS de la **Tabla 5.3 de la tesis**, copiada en el script. `factors.csv` no se usa como fuente de IS.
- **Se corrigen las dos erratas** al generar («códigofuente» → «código fuente»; «es una sistemas de administración…» → «es un sistema de administración…»). Los archivos de `docs/fuentes/` no se modifican: son la referencia.
- **El cálculo de la tesis** entra como `calculo_sugerida` con `origen = 'tesis'`, `estado = 'publicado'`, `vigente = true`, `etiqueta_rango` «RSL de la tesis» y fuentes «IEEE, ACM, Scopus, WoS», con sus 18 filas `sugerida_factor`.
- **La semilla no crea usuarios.** El administrador inicial se registra como cualquier usuario y se promueve a mano (README, «Administrador inicial»), porque un usuario sembrado implicaría una contraseña en el repositorio.
- **Se prueba**: `supabase/tests/semilla.test.sql` (9 pruebas) comprueba los conteos 3/18/61, la corrección de las erratas, el cálculo vigente y los valores de la Tabla 5.3.

## Consecuencias

- `npm run db:reset` deja siempre la misma base de partida (`[db.seed]` habilitado en `supabase/config.toml`).
- Si cambia el catálogo o la Tabla 5.3, se edita el generador y se regenera la semilla; no se editan los INSERT a mano.
- Las pruebas de RLS truncan la semilla al empezar y crean sus propios datos.
