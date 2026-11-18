# ADR-003: Esquema de la base de datos en Supabase

- **Estado**: aceptada
- **Fecha**: 17/11/2026

## Contexto

El diseño físico de la Tarea 1 (Anexo A, copiado en [`docs/fuentes/anexo_a_tarea1.sql`](../fuentes/anexo_a_tarea1.sql)) es la base del esquema. Se escribió para un PostgreSQL con usuarios propios. GUIOS PRO 2.0 usa Supabase Auth, seguridad por fila (RLS) y un recálculo de la IS por pasos. BRIEF §10.2 fija los ajustes obligatorios.

## Decisión

El esquema vive en tres migraciones de `supabase/migrations/`:

| Migración         | Contenido                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `…_esquema.sql`   | Las 13 tablas: las 12 del Anexo A, con `perfil` en lugar de `usuario`, más `recalculo_paso` |
| `…_rls.sql`       | RLS en todas las tablas, `es_admin()` y las políticas de BRIEF §10.3                        |
| `…_funciones.sql` | Trigger que crea el perfil, trigger de `fecha_actualizacion` y las RPC de BRIEF §11.2       |

### Ajustes sobre el Anexo A (BRIEF §10.2)

| #   | Ajuste                                                                                                                                                                                                               | Dónde                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | `usuario` → `perfil` (`id` UUID → `auth.users` con `ON DELETE CASCADE`); sin `correo` ni `clave_hash`                                                                                                                | `perfil`                            |
| 2   | Un trigger sobre `auth.users` crea el perfil con rol `decisor`. El nombre sale de `raw_user_meta_data.nombre_completo` o, si falta, del correo                                                                       | `crear_perfil()`                    |
| 3   | `evaluacion.id_usuario` es `UUID NOT NULL DEFAULT auth.uid() REFERENCES perfil(id)`                                                                                                                                  | `evaluacion`                        |
| 4   | `organizacion` y `software_evaluado` reciben `creado_por UUID NOT NULL DEFAULT auth.uid()`                                                                                                                           | ambas                               |
| 5   | Todos los `TIMESTAMP` pasan a `TIMESTAMPTZ` con `DEFAULT now()`                                                                                                                                                      | todas                               |
| 6   | `referencia` cuelga de `calculo_sugerida` (`id_calculo NOT NULL … ON DELETE CASCADE`), con `id_subfactor NOT NULL`, `doi NOT NULL` y `UNIQUE (id_calculo, id_subfactor, doi)`                                        | `referencia`                        |
| 7   | `total_citas` = filas de `referencia` del factor en ese cálculo; lo devuelve `conteo_citas()`. El cálculo de la tesis guarda los TC de la Tabla 5.3                                                                  | `sugerida_factor`, `conteo_citas()` |
| 8   | `anio_inicio` y `anio_fin` aceptan `NULL`, pero solo si `origen = 'tesis'` (CHECK `calculo_rango_requerido`); nueva columna `etiqueta_rango`                                                                         | `calculo_sugerida`                  |
| 9   | `estado`, `progreso` (0..18), `parametros`, `mensaje_error` y `creado_por`. El CHECK `calculo_vigente_publicado` impide un vigente que no esté `publicado`; se mantiene el índice único parcial `uq_calculo_vigente` | `calculo_sugerida`                  |
| 10  | Tabla nueva `recalculo_paso` con `PRIMARY KEY (id_calculo, id_subfactor)`                                                                                                                                            | `recalculo_paso`                    |
| 11  | `evaluacion.causas JSONB` (debe ser un arreglo de `{factor, foda, ir}`)                                                                                                                                              | `evaluacion`                        |
| 12  | `evaluacion_participante` queda fuera, como pide el BRIEF                                                                                                                                                            | —                                   |

### Decisiones propias (no estaban en el BRIEF)

- **Borrado en cascada desde `auth.users`.** Al borrar una cuenta se borran su perfil, sus evaluaciones, organizaciones y software. Sin esto, el `ON DELETE CASCADE` de `perfil` fallaría por las claves foráneas. Los cálculos de IS no se borran: su `creado_por` pasa a `NULL`.
- **El rol se protege con privilegios por columna.** El cliente solo puede actualizar `nombre_completo` e `id_organizacion` de su perfil, y no puede insertar ni borrar perfiles. Una política de RLS no puede comparar el valor viejo con el nuevo; el privilegio por columna sí impide tocar `rol`.
- **La evaluación nace con el cálculo vigente y no lo cambia.** La política de `INSERT` exige que `id_calculo` sea el vigente (BRIEF §11.1). El privilegio por columna deja actualizar solo `id_software`, `titulo`, `estado`, `codigo_recomendacion`, `texto_recomendacion` y `causas`: ni `id_calculo` ni `id_usuario`.
- **Sin `TRUNCATE`, `REFERENCES` ni `TRIGGER` para el cliente.** Supabase los concede por defecto a `anon` y `authenticated`, y `TRUNCATE` ignora RLS.
- **Las valoraciones usan funciones `security definer`.** `es_evaluacion_propia()` y `es_valoracion_propia()` comprueban el dueño y el estado `en_curso` sin depender de las políticas de `evaluacion`, y evitan la recursión entre políticas.
- **Escritura de las RPC.** Las cuatro funciones de §11.2 exigen `es_admin()` y fallan con el código `42501` para un decisor:
  - `guardar_resultado_calculo` solo acepta un cálculo `en_proceso` o `pausado` con un paso `hecho` por cada subfactor del catálogo (un paso en `error` o faltante también lo bloquea), y exactamente 18 filas, una por factor distinto del catálogo.
  - `publicar_calculo` solo publica un cálculo `completado`. Bloquea primero el vigente para serializar publicaciones simultáneas.
  - `descartar_calculo` rechaza el vigente y cualquier cálculo que ya usen evaluaciones, porque guardan su IS como fotografía (trampa 9).
- **`fecha_actualizacion`** se mantiene con un trigger en cada `UPDATE` de `evaluacion`.
- **Índices** en las claves foráneas que usan las políticas (`creado_por`, `id_usuario`, `id_calculo`) y las consultas (`subfactor.id_factor`, `referencia.id_subfactor`).

## Consecuencias

- Las pruebas de `supabase/tests/rls.test.sql` (pgTAP, `npm run test:db`) fijan este comportamiento, incluidos los dos casos de BRIEF §15.3: un usuario no lee la evaluación de otro y un decisor no publica cálculos.
- La CI todavía no levanta Supabase: las pruebas de base de datos se corren en local antes de abrir un PR que toque `supabase/`.
- Los tipos de `src/lib/database.types.ts` se regeneran con `npm run gen:types` después de cada migración.
- Quedan como mejoras futuras, sin riesgo de lectura de datos ajenos:
  - `perfil.id_organizacion` y `evaluacion.id_software` pueden apuntar a filas de otro usuario (solo revela si un id existe).
  - `valoracion_subfactor.id_subfactor` no se valida contra el factor de su `valoracion_factor`.
  - Un decisor lee todos los `calculo_sugerida`, incluidos `descartado` y `fallido`, como permite BRIEF §10.3.
- Las Edge Functions (issue #10) escriben `referencia` y `recalculo_paso` con `service_role`, que omite RLS.
