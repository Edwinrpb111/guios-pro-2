# BRIEF DEL PROYECTO — GUIOS PRO 2.0

**Sistema web para evaluar si un software libre (FLOSS) es adecuado para una organización**
Asignatura: Procesos y Calidad de Software · Ingeniería de Software · UNEMI · Periodo agosto–diciembre 2026
Versión del brief: **2.0 — 17/11/2026** (reemplaza a la del 10/10/2026: cambia el stack a Vercel + Supabase y agrega las APIs externas) · Preparado a partir de la Tarea 1 (Sprint 0), el Componente Práctico 1 (diseño preliminar), la tesis doctoral de Rea Sánchez (2022) y el código del prototipo GUIOS PRO.

> **Cómo usar este documento.** Es la fuente única para construir el proyecto. Está escrito para entregárselo completo a un agente de desarrollo junto con la carpeta de fuentes (§3). El agente debe seguirlo sección por sección, empezar por el prompt de §18 y no detenerse a preguntar por los puntos de §17: ahí está el valor por defecto de cada uno. Si algo de este brief contradice a la tesis, manda la tesis (§3). Si contradice a la versión del 10/10/2026, manda esta.

---

## Índice

1. Contexto académico y equipo
2. Qué vamos a construir
3. Fuentes de verdad y orden de prioridad
4. Dominio: catálogo, escalas y reglas de negocio
5. Trampas conocidas (leer antes de programar)
6. Casos de prueba de referencia ("golden tests")
7. Requisitos y Product Backlog
8. Arquitectura y stack tecnológico
9. Estructura del repositorio
10. Base de datos
11. Acceso a datos y contratos (Supabase)
12. Frontend
13. Módulo de importancia sugerida con IA y APIs externas
14. Seguridad
15. Calidad, pruebas y proceso (Scrum + Git)
16. Plan de construcción con criterios de aceptación
17. Pendientes por validar con el docente
18. Prompt de arranque sugerido
19. Glosario

---

## 1. Contexto académico y equipo

| Dato | Valor |
|---|---|
| Docente | Mgs. Víctor Hugo Rea Sánchez (autor de la tesis base) |
| Objetivo de la asignatura | Aplicar metodologías ágiles para construir software con estándares de calidad |
| Metodología | Scrum con gestión en ClickUp (Tarea 2): 3 sprints de 3 días, del 14/11 al 22/11/2026 |
| Entregables previos | Tarea 1 (Sprint 0: modelado del negocio, requisitos, backlog y diseño de BD), entregada el 02/10/2026 · Componente Práctico 1 (diseño preliminar: wireframes, mockups y prototipo), cierre el 11/10/2026 |
| Entregable final | El sistema funcionando y desplegado en Vercel, para que el cliente (el docente) lo pruebe. Entrega: lunes 23/11/2026 |

**Equipo Scrum** (definido en la Tarea 1):

| Rol | Integrante |
|---|---|
| Product Owner | Cristian Xavier Montoya Patin |
| Scrum Master | Edwin Ricardo Pastor Barzallo |
| Equipo de desarrollo | Laddy Lisset Rocha Leon, Harold Josue Santana Correa, Moises Jordy Vargas Chavez |

El PO y el SM también desarrollan. Capacidad supuesta: unos 20 puntos por sprint. Responsables por área: Laddy (frontend), Harold (base de datos y servicios Supabase), Moises (`guios-core` y pruebas), Edwin (repositorio, CI/CD, despliegue), Cristian (aceptación).

---

## 2. Qué vamos a construir

### 2.1 Visión
Evolucionar el prototipo **GUIOS PRO** (Flexx/Python, 2021) hacia un **sistema web robusto** que implemente la guía **GUIOS** de la tesis **sin alterar su lógica**. El decisor de una organización valora 18 factores y 61 subfactores, y el sistema clasifica cada factor con un enfoque FODA y emite una recomendación de adopción **A, B o C**.

Nombre de trabajo: **GUIOS PRO 2.0**.

### 2.2 Las tres mejoras del proyecto
1. **Interfaz nueva**: asistente guiado, valoración en un clic, matriz FODA gráfica, versión móvil. Ya está diseñada en el Componente Práctico 1.
2. **Persistencia**: usuarios, roles, organizaciones, software evaluado, historial, borradores, comparación e informe PDF.
3. **Importancia sugerida recalculable con IA** (aporte principal). Hoy la IS viene fija en el código; el sistema permitirá recalcularla con literatura de 2020–2025, guardando evidencia y conservando el histórico.

### 2.3 Fuera de alcance
- Modificar las reglas RN-01 a RN-08.
- Repetir la encuesta a expertos (IE se mantiene fija en 3).
- El análisis de Pareto de la tesis.
- Integración con sistemas externos de la organización.
- Análisis automático del software evaluado.
- Evaluación colaborativa entre varios decisores: la pidió la especialista del piloto de la tesis, pero no se acordó en el Sprint 0. Queda como candidata para el backlog.

---

## 3. Fuentes de verdad y orden de prioridad

Todo está en `C:\Users\pasto\Downloads\PROCESOS Y CALIDAD DE SOFTWARE\`:

| Archivo | Qué contiene | Prioridad |
|---|---|---|
| `TESIS VRS.pdf` | Método completo. **Cap. 5.2.3** (indicadores IE, IL, IS, ID, IR, PS, PM, FODA), **Tabla 5.3** (valores de referencia), **Figura 5.10** (función de intersección), **Tabla 5.4** (alcances), **Cap. 6** (pasos, prototipo, caso piloto LibreOffice–UNEMI, textos de recomendaciones), **Cap. 7** (limitaciones) | **1 — manda** |
| `S4-TAREA_1 NUEVA.pdf` | Sprint 0: reglas RN-01..RN-10, RF, RNF, backlog HU-01..HU-17, hoja de ruta, modelo ER, esquema lógico y **script SQL (Anexo A)** | 2 |
| `COMPONENTE PRACTICO 1/` | Sección `.tex` del diseño, 21 PNG (wireframes y mockups) y **`prototipo/GUIOS_PRO_2.0_prototipo.html`**, la referencia visual y de interacción, con la lógica del método ya implementada en JS (funciones `isf`, `relevante`, `pm`, `foda`, `quantile`, `ilFrom`, `recommend` y `pilot`): es la base para portar a `guios-core` | 2 |
| `GUIOSPRO_FLOSS/GUIOSPRO_FLOSS-main 2/guiosad.html` | Prototipo original del profe, compilado (versión web ejecutable) | 3 |
| `.../main.py`, `.../guiosad.py` | Código fuente Python/Flexx del prototipo original. **Tiene errores** (ver §5) | 4 |
| `.../guiosad_data.csv` | Catálogo: dimensión, factor y subfactor (61 filas, tabulado) | Datos |
| `.../factors.csv` | Factor, IS y alcance del prototipo. **2 IS difieren de la tesis** | Datos (corregir) |
| `.../MATRIZ RECOMENDACION GUIOSAD 2021.xlsx` | Borrador antiguo de la matriz de recomendación. **Tiene las letras invertidas** | No usar |
| `.../Manual tecnico GUIOSPRO FLOSS.pdf` | Instalación del prototipo original (Python 3.9, PyCharm, flexx, pandas) | Referencia |

| `Tarea2/` | Planificación Scrum cargada en ClickUp (`contenido_clickup.md`), casos de prueba CP-01..CP-14 y sus resultados sobre el prototipo (`evidencias/qc_resultados_prototipo_CP1.json`), y `APIS_GUIOS_PRO_2.0.md` (resumen de §13) | 2 |

**Para el agente:** antes de programar, copiar al repositorio, en `docs/fuentes/`, estos archivos: `guiosad_data.csv`, `factors.csv`, `GUIOS_PRO_2.0_prototipo.html`, los PNG de `img_cp1/` y el script SQL del Anexo A (está al final de `S4-TAREA_1 NUEVA.pdf`; al extraerlo del PDF hay que cambiar las comillas tipográficas `’` por `'`). La tesis y los demás PDF no se suben al repositorio.

Repositorio público del prototipo original: `https://github.com/victorreadoctorado/GUIOSPRO_FLOSS`

---

## 4. Dominio: catálogo, escalas y reglas de negocio

### 4.1 Catálogo de factores (Tabla 5.3 de la tesis)
3 dimensiones, 18 factores y 61 subfactores. NS = n.º de subfactores; TC = total de citas en la tesis; IE = 3 en todos.

| # | Factor | Dim. | Alcance | NS | TC | IL | IS |
|---|---|---|---|---|---|---|---|
| 1 | Compatibilidad | Tecnológica | Externo | 8 | 33 | 3 | 3 |
| 2 | Personalización | Tecnológica | Externo | 6 | 30 | 4 | 3 |
| 3 | Prueba | Tecnológica | Externo | 1 | 4 | 3 | 3 |
| 4 | Fiabilidad | Tecnológica | Externo | 5 | 19 | 3 | 3 |
| 5 | Reusabilidad | Tecnológica | Externo | 2 | 5 | 2 | 2 |
| 6 | Usabilidad | Tecnológica | Externo | 4 | 14 | 2 | **2** |
| 7 | Mantenibilidad | Tecnológica | Externo | 1 | 4 | 3 | 3 |
| 8 | Portabilidad | Tecnológica | Externo | 2 | 4 | 2 | 2 |
| 9 | Documentación | Tecnológica | Externo | 11 | 20 | 1 | 2 |
| 10 | Formación | Organizacional | Interno | 4 | 27 | 4 | 3 |
| 11 | Tiempo de adopción | Organizacional | Interno | 2 | 2 | 1 | 2 |
| 12 | Casos de estudio de adopción FLOSS | Organizacional | Externo | 1 | 1 | 1 | 2 |
| 13 | Centralidad de la tecnología de la información | Organizacional | Interno | 2 | 2 | 1 | 2 |
| 14 | Apoyo de la alta dirección | Organizacional | Interno | 1 | 5 | 4 | **3** |
| 15 | Bloqueo de proveedores | Organizacional | Externo | 1 | 3 | 2 | 2 |
| 16 | Soporte | Organizacional | **Ambos** | 6 | 43 | 4 | 3 |
| 17 | Actitud hacia el cambio | Organizacional | Interno | 2 | 3 | 1 | 2 |
| 18 | Coste total de propiedad | Económica | Interno | 2 | 24 | 4 | 3 |

Los textos de los 61 subfactores están en `guiosad_data.csv`. Al cargarlos, corregir dos erratas: "códigofuente" → "código fuente" y "es una sistemas de administración…" → "es un sistema de administración…".

### 4.2 Escalas
- **Importancia** (IE, IL, IS, ID, IR): 1 Irrelevante · 2 Opcional · 3 Importante · 4 Fundamental.
- **Cumplimiento del subfactor** (PS): 1 No cumple el requisito · 2 Desconozco si cumple · 3 Cumple parcialmente · 4 Cumple el requisito.

### 4.3 Reglas de negocio (implementar tal cual)

| ID | Regla | Fórmula / definición |
|---|---|---|
| RN-01 | Escala de importancia | 1..4, como en §4.2 |
| RN-02 | Importancia relativa | `IR = floor((IS + ID) / 2)`. Es la función de la Figura 5.10; coincide en los 16 casos con la tabla del §6.1 |
| RN-03 | Relevancia | El factor es relevante si `IR > 1`. Solo los relevantes se valoran por subfactores |
| RN-04 | Alcance | Fijo por factor (Tabla 5.4). **Soporte = "Ambos"**: el decisor elige Interno o Externo (por defecto Interno). Interno = conocimiento propio de la organización; Externo = terceros o comunidad |
| RN-05 | Cumplimiento | 1..4, como en §4.2 |
| RN-06 | Ponderación media (PM) | Promedio aritmético de los PS del factor. Un factor está **evaluado** solo si todos sus subfactores tienen valor |
| RN-07 | FODA | Interno: PM ≥ 3 → **Fortaleza**; < 3 → **Debilidad**. Externo: PM ≥ 3 → **Oportunidad**; < 3 → **Amenaza** |
| RN-08 | Recomendación | Considera solo los factores evaluados. **C** si existe una Debilidad o Amenaza con IR ≥ 3. **B** si no se cumple lo anterior pero existe una Debilidad o Amenaza con IR = 2. **A** si todos son Fortaleza u Oportunidad. Sin factores evaluados, no hay recomendación |
| RN-09 | Importancia de la literatura | `c_i` = **suma de las citas encontradas para cada subfactor** del factor *i* (tesis, paso 2a). `r_i = c_i / n_i`. Se calculan q1, q2 y q3 de las 18 r con **percentil de interpolación lineal** (como `numpy.percentile` por defecto o `PERCENTIL.INC` de Excel). IL = 1 si r ≤ q1; 2 si ≤ q2; 3 si ≤ q3; 4 si > q3 |
| RN-10 | Importancia sugerida | `IS = floor((IE + IL) / 2)`, con IE = 3 fija. Los 18 factores se recalculan juntos, porque IL es relativa |

### 4.4 Textos de las recomendaciones (versión de la tesis, §6.2.3)
- **A — Adoptar el software evaluado.** Todos los factores evaluados son fortalezas u oportunidades; la organización cumple satisfactoriamente los requisitos. Si algún subfactor no cumple el mínimo, se sugiere revisarlo en una segunda evaluación.
- **B — Es posible adoptar, con matices.** Hay amenazas o debilidades solo en factores de importancia relativa opcional. Se sugiere una segunda evaluación de los subfactores que no cumplen (por ejemplo: formación del personal TIC, consultores externos, documentación en varios formatos, reducir dependencia de proveedores, evitar costes ocultos).
- **C — Analizar la adopción; debería posponerse.** Hay debilidades o amenazas en factores importantes o fundamentales. La organización debe proporcionar los recursos necesarios: si son internos, mejorar aspectos de la organización (entrenamiento, soporte 24/7/365, desarrolladores, actitud al cambio); si son externos, dedicar recursos de ingeniería a mejorar el software (compatibilidad de hardware o sistemas operativos, personalización sin tocar código, facilidad de despliegue).
- **Mejora del diseño (CP1):** junto al texto, mostrar los **factores que causan** la recomendación (nombre, clasificación FODA e IR). Responde a la crítica de "mensajes genéricos" del piloto.

---

## 5. Trampas conocidas (leer antes de programar)

1. **Las letras de la matriz Excel 2021 están invertidas**: allí "A" es *no adoptar*. Usar la versión de la tesis: **A = adoptar, C = posponer**. En `main.py`, las variables `ra/rb/rc` también tienen nombres cruzados, aunque los textos sí son correctos.
2. **`factors.csv` tiene dos IS erróneas**: Usabilidad trae 3 (correcto: **2**) y Apoyo de la alta dirección trae 2 (correcto: **3**). La semilla debe usar la Tabla 5.3.
3. **`guiosad.py` → `relevant()` usa `> 2`** (solo Fundamental es relevante), pero nunca se llama. El flujo real (`main.py`, `r > 0` con índices 0..3) equivale a **IR > 1**, igual que la tesis.
4. **`main.py` → `a, b, c = False` lanza un error** en Python, así que la recomendación de la versión Python no funciona. La referencia ejecutable es `guiosad.html`. Además, ese código calcula primero un mensaje por conteo de factores buenos y malos y luego lo descarta: no implementar ese conteo.
5. **Índices 0..3 frente a 1..4**: `(a0 + b0) // 2` con índices desde 0 equivale a `floor((a + b) / 2)` con valores desde 1. En la BD y en `guios-core` usar siempre **1..4**.
6. **`c_i` se cuenta por subfactor**, no por artículo. Un artículo que trata dos subfactores cuenta dos veces. La Tarea 1 lo redactó como "artículos que traten el factor"; la tesis manda.
7. **Clasificar con la PM sin redondear.** La BD guarda `NUMERIC(3,2)` solo como registro; la regla FODA se aplica sobre el valor exacto.
8. **Los factores no evaluados no cuentan** para la recomendación (RN-08). Un factor relevante a medio valorar se muestra como "pendiente".
9. **Los valores derivados se guardan como fotografía** (IR, PM, FODA y la recomendación) en el momento de la evaluación, junto con el `id_calculo` de IS usado. Si mañana cambia el cálculo vigente, las evaluaciones viejas no cambian.
10. **Solo un cálculo de IS puede estar vigente** (índice único parcial en la BD).

---

## 6. Casos de prueba de referencia ("golden tests")

Guardarlos como JSON en `src/guios-core/fixtures/`. Los ejecuta la suite de `guios-core` (Vitest) y el caso piloto se repite de punta a punta en Playwright. Si alguno falla, no se integra (RNF-01). Equivalen a los casos CP-01..CP-14 de ClickUp, que ya pasan sobre el prototipo del CP1.

### 6.1 Función de intersección (RN-02 y RN-10) — 16 casos
Filas: primer argumento (ID o IE); columnas: segundo (IS o IL).

| | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| **4** | 2 | 3 | 3 | 4 |
| **3** | 2 | 2 | 3 | 3 |
| **2** | 1 | 2 | 2 | 3 |
| **1** | 1 | 1 | 2 | 2 |

### 6.2 IL e IS desde los datos de la tesis (RN-09 y RN-10)
Entrada: NS y TC de la tabla §4.1. Salida esperada: exactamente las columnas IL e IS de §4.1. Cuartiles con interpolación lineal: q1 ≈ 1,8636; q2 = 3,65; q3 ≈ 4,7813.

### 6.3 Caso piloto LibreOffice–UNEMI (tesis §6.2.3)
- **Entradas ID:** Compatibilidad 4, Soporte 4; Reusabilidad, Tiempo de adopción y Casos de estudio 2; el resto 3. Soporte con alcance **Interno**. (La tesis nombra explícitamente las Fundamentales y tres Opcionales "entre otras"; el resto se toma como Importante. Esta reconstrucción es la misma del prototipo del CP1.)
- **FODA esperado:**
  - Oportunidades (7): Compatibilidad, Prueba, Fiabilidad, Reusabilidad, Usabilidad, Mantenibilidad, Casos de estudio.
  - Fortalezas (4): Tiempo de adopción, Apoyo de la alta dirección, Actitud hacia el cambio, Coste total de propiedad.
  - Amenazas (4): Personalización, Portabilidad, Documentación, Bloqueo de proveedores.
  - Debilidades (3): Formación, Centralidad de la TI, Soporte.
- **Recomendación esperada: C**, causada por Personalización (Amenaza, IR 3), Formación (Debilidad, IR 3) y Soporte (Debilidad, IR 3).
- La tesis no publica los PS por subfactor. Usar los PS del prototipo del CP1 (función `pilot()` del HTML), que producen esa clasificación.

### 6.4 Casos borde de la recomendación
| Situación | Resultado |
|---|---|
| Ningún factor evaluado | Sin recomendación |
| Todos los evaluados son F u O | A |
| Una única Debilidad con IR = 2 y el resto F u O | B |
| Una Amenaza con IR = 2 y una Debilidad con IR = 4 | C |
| Factor relevante con un subfactor sin valorar | Se excluye; los demás deciden |
| PM = 3,00 exacto en factor externo | Oportunidad |

---

## 7. Requisitos y Product Backlog

### 7.1 Requisitos funcionales (Tarea 1)
| ID | Descripción | Regla |
|---|---|---|
| RF-01 | Mostrar los 18 factores con su IS vigente y su alcance | RN-01, RN-04 |
| RF-02 | Asignar la importancia del decisor por factor | RN-01 |
| RF-03 | Calcular IR y relevancia | RN-02, RN-03 |
| RF-04 | Elegir el alcance de los factores "Ambos" | RN-04 |
| RF-05 | Mostrar y valorar los subfactores de los factores relevantes | RN-05 |
| RF-06 | Calcular y guardar la PM | RN-06 |
| RF-07 | Clasificar en FODA | RN-07 |
| RF-08 | Emitir la recomendación A, B o C con explicación | RN-08 |
| RF-09 | Buscar con IA artículos de 2020–2025 por factor y subfactor | RN-09 |
| RF-10 | Registrar las referencias (título, año, DOI, base) y las citas | RN-09 |
| RF-11 | Calcular IL e IS de los 18 factores, publicar como vigente y conservar el histórico | RN-09, RN-10 |
| RF-12 | Consultar el detalle de un cálculo de IS | RN-09, RN-10 |
| RF-13 | Registro, inicio de sesión y rol de administrador | — |
| RF-14 | Guardar, retomar y ver el historial de evaluaciones | — |
| RF-15 | Asociar la evaluación a una organización y un software | — |
| RF-16 | Informe PDF | — |
| RF-17 | Comparar dos evaluaciones | — |

### 7.2 Requisitos no funcionales (ISO/IEC 25010)
| ID | Característica | Criterio verificable |
|---|---|---|
| RNF-01 | Adecuación funcional | Pasan los golden tests de §6 |
| RNF-02 | Usabilidad | Interfaz en español, guiada, con ayudas; un usuario nuevo completa una evaluación sin capacitación |
| RNF-03 | Compatibilidad | Últimas versiones de Chrome, Firefox y Edge; responsive desde 360 px |
| RNF-04 | Desempeño | Cálculo y guardado en < 2 s; el recálculo con IA es asíncrono y muestra su progreso |
| RNF-05 | Seguridad | Contraseñas gestionadas por Supabase Auth; cada evaluación solo la ve su dueño (RLS); recálculo solo para administradores; HTTPS; ninguna clave de API en el cliente |
| RNF-06 | Fiabilidad | No se pierden datos ante cierres; respaldo de la BD |
| RNF-07 | Mantenibilidad | Lógica separada de la interfaz y cubierta por pruebas; el proveedor de IA es reemplazable |
| RNF-08 | Portabilidad | PostgreSQL estándar con migraciones SQL versionadas; entorno local reproducible con Supabase CLI; despliegue en Vercel (cambia respecto a la Tarea 1, que pedía contenedores: ver §17.8) |
| RNF-09 | Trazabilidad | Cada cálculo de IS guarda años, fecha, fuentes y referencias |

### 7.3 Product Backlog (MoSCoW · puntos Fibonacci)
| HU | Historia | Prio | Pts | Pantallas CP1 |
|---|---|---|---|---|
| HU-01 | Cargar el catálogo y el cálculo de la tesis en la BD | Must | 5 | — |
| HU-02 | Ver la IS vigente y asignar mi importancia | Must | 5 | P-04 |
| HU-03 | IR, relevancia y alcance de Soporte | Must | 5 | P-04 |
| HU-04 | Valorar subfactores | Must | 8 | P-05 |
| HU-05 | PM y FODA por factor | Must | 8 | P-05, P-06 |
| HU-06 | Recomendación con explicación | Must | 5 | P-06 |
| HU-07 | Búsqueda de artículos con IA y registro de citas | Must | 13 | P-09 |
| HU-08 | Calcular IL e IS y publicar como vigente | Must | 8 | P-09 |
| HU-09 | Interfaz nueva guiada | Must | 8 | P-03 a P-06 |
| HU-10 | Detalle y referencias de cada cálculo de IS | Should | 5 | P-10 |
| HU-11 | Ayudas contextuales y diseño responsive | Should | 5 | P-11, móvil |
| HU-12 | Matriz FODA gráfica | Should | 5 | P-06 |
| HU-13 | Registro e inicio de sesión | Should | 8 | P-01 |
| HU-14 | Guardar, retomar e historial | Should | 8 | P-02 |
| HU-15 | Informe PDF | Should | 5 | P-06 |
| HU-16 | Organización y software de la evaluación | Could | 5 | P-03 |
| HU-17 | Comparar dos evaluaciones | Could | 8 | P-07 |

Totales: Must 65, Should 36, Could 13. Candidata nueva (sin estimar): evaluación colaborativa entre varios decisores.

---

## 8. Arquitectura y stack tecnológico

### 8.1 Stack (decisión del equipo, registrar como ADR-001)
Reemplaza a la propuesta del 10/10/2026 (FastAPI + Python + Docker). No hay backend propio: el navegador habla con Supabase y las integraciones externas corren en Edge Functions.

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend | **React 18 + TypeScript (estricto) + Vite**, React Router, TanStack Query | SPA; los componentes salen del prototipo del CP1; no hace falta renderizado en servidor |
| Hosting | **Vercel** (proyecto Vite, despliegue por cada push; `vercel.json` con *rewrite* de todas las rutas a `index.html`) | Despliegue continuo y URL pública para el cliente |
| Lógica del método | **`guios-core`**: carpeta `src/guios-core/` en TypeScript puro, sin importar React ni Supabase | Un solo lugar para las reglas (RNF-07) |
| Base de datos | **Supabase PostgreSQL** con migraciones SQL en `supabase/migrations/` | PostgreSQL elegido en la Tarea 1 |
| Autenticación | **Supabase Auth** (correo y contraseña) + tabla `perfil` con el rol | RNF-05 sin código propio de contraseñas |
| Autorización | **Row Level Security** en todas las tablas + funciones SQL `security definer` para las operaciones de administrador | Aislamiento por usuario |
| Integraciones externas | **Supabase Edge Functions** (Deno) para OpenAlex, Crossref y el LLM | Las claves no llegan al navegador |
| Estilos | CSS con variables (tokens del CP1, §12.3) | Respeta la guía de estilo |
| Gráficos | SVG/CSS propios, como el prototipo | Matriz FODA y barras |
| PDF | Vista de impresión (`/evaluaciones/:id/informe`) con CSS `@media print` y `window.print()` | Sin servidor |
| Pruebas | **Vitest** + Testing Library, **Playwright** (E2E) | Calidad verificable |
| Calidad estática | **ESLint** + **Prettier**, `tsc --noEmit` | Estándares de código |
| CI | **GitHub Actions**: lint, tipos, pruebas con cobertura y build | Definición de terminado automatizada |
| Gestión | **ClickUp** | Obligatoria en la asignatura |

### 8.2 Principio rector
**La lógica del método vive en un solo lugar (`src/guios-core/`) y no conoce la BD ni la interfaz.** Recibe datos planos y devuelve resultados. Una regla de ESLint (`no-restricted-imports`) impide que esa carpeta importe algo de fuera de ella. Ya no hay "espejo" en otro lenguaje: al ser todo TypeScript, la interfaz usa el mismo módulo para las vistas previas y para la fotografía final.

### 8.3 Quién calcula qué (ADR-002)
- **Evaluaciones:** `guios-core` corre en el navegador. Cada cambio guarda la entrada (ID, alcance, PS) y los derivados (IR, relevancia, PM, FODA). **Finalizar** guarda la recomendación, el texto y las causas, y cambia el estado. Un usuario solo puede escribir sus propias evaluaciones (RLS), así que como mucho alteraría la suya.
- **Recálculo de IS:** las Edge Functions buscan, clasifican y guardan referencias. El conteo `c_i` sale de una consulta SQL. IL e IS las calcula `guios-core` en el navegador del administrador y las guarda la función SQL `guardar_resultado_calculo` (solo administradores).
- Las Edge Functions **no** importan `guios-core` (evita compartir código entre Vite y Deno).

### 8.4 Flujo de una evaluación
`Contexto (P-03)` → `Factores: ID → IR → relevancia (P-04)` → `Subfactores: PS → PM (P-05)` → `Resultados: FODA + recomendación (P-06)`. Cada cambio se guarda como borrador (*upsert*); **Finalizar** congela la fotografía y la evaluación deja de ser editable.

---

## 9. Estructura del repositorio

```
guios-pro-2/
├─ README.md                  # cómo levantar todo en local y cómo desplegar
├─ BRIEF.md                   # este documento
├─ .env.example               # variables de §13.7, sin valores
├─ vercel.json                # rewrite SPA
├─ package.json  ·  vite.config.ts  ·  tsconfig.json  ·  eslint.config.js
├─ .github/
│  ├─ workflows/ci.yml
│  └─ pull_request_template.md
├─ docs/
│  ├─ fuentes/                # CSV, prototipo HTML, PNG del CP1, SQL del Anexo A (§3)
│  └─ decisiones/             # ADR-001 stack, ADR-002 dónde se calcula, ADR-003 ajustes de BD
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/             # 0001_esquema.sql, 0002_rls.sql, 0003_funciones.sql
│  ├─ seed.sql                # generado por scripts/generar-semilla.ts
│  └─ functions/
│     ├─ _shared/             # auth.ts (exige rol administrador), openalex.ts, crossref.ts, clasificador.ts, doi.ts
│     ├─ recalculo-iniciar/index.ts
│     └─ recalculo-paso/index.ts
├─ scripts/
│  └─ generar-semilla.ts      # lee guiosad_data.csv + tabla §4.1, corrige erratas, escribe seed.sql
├─ src/
│  ├─ guios-core/             # TypeScript puro
│  │  ├─ escalas.ts           # Importancia, Cumplimiento, Alcance, Foda
│  │  ├─ reglas.ts            # interseccion, esRelevante, ponderacionMedia, clasificarFoda, recomendar
│  │  ├─ literatura.ts        # razon, cuartiles (lineal), il, recalcularIS
│  │  ├─ textos.ts            # textos de las recomendaciones (§4.4)
│  │  ├─ fixtures/            # interseccion.json, is_tesis.json, piloto_libreoffice.json, recomendacion_bordes.json
│  │  └─ *.test.ts
│  ├─ lib/                    # supabase.ts (cliente), consultas tipadas, tipos generados (supabase gen types)
│  ├─ components/             # SegmentedSelector, FodaChip, ProgressRing, FodaMatrix, PmBar, Stepper, BottomBar...
│  ├─ pages/                  # P-01..P-11
│  └─ styles/tokens.css       # colores y tipografía del CP1
└─ e2e/                       # Playwright: piloto LibreOffice → C
```

---

## 10. Base de datos

### 10.1 Punto de partida
El **script SQL del Anexo A de la Tarea 1** (PostgreSQL) es la base de la migración inicial. Tiene 12 tablas en 3FN:

- **Catálogo:** `dimension`, `factor` (con `importancia_experto` = 3, `alcance`, `orden`), `subfactor`.
- **Importancia sugerida:** `calculo_sugerida` (origen `tesis`|`ia`, años, fuentes, fecha, `vigente` con índice único parcial), `sugerida_factor` (n, citas, razón, IE, IL, IS por factor y cálculo), `referencia` (título, año, DOI, base, `id_subfactor`).
- **Transaccional:** `organizacion`, `usuario`, `software_evaluado`, `evaluacion` (estado, recomendación, `id_calculo`), `valoracion_factor` (ID, IR, relevancia, alcance aplicado, PM, FODA), `valoracion_subfactor` (PS).

### 10.2 Ajustes obligatorios sobre el Anexo A (documentarlos en ADR-003)

**Por Supabase Auth**
1. `usuario` se reemplaza por **`perfil`**: `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `id_organizacion`, `nombre_completo`, `rol` (`decisor`|`administrador`, por defecto `decisor`), `fecha_registro`. Sin `correo` ni `clave_hash` (los guarda Supabase Auth).
2. Un *trigger* sobre `auth.users` crea el `perfil` con rol `decisor` al registrarse. El rol no es editable por el usuario.
3. `evaluacion.id_usuario` pasa a `UUID NOT NULL DEFAULT auth.uid() REFERENCES perfil(id)`.
4. `organizacion` y `software_evaluado` reciben `creado_por UUID NOT NULL DEFAULT auth.uid()` (el Anexo A no tenía dueño y RLS lo necesita).
5. Todos los `TIMESTAMP` pasan a `TIMESTAMPTZ`.

**Por el método (trampas 6, 9 y 10)**
6. `referencia` cuelga del cálculo, no de `sugerida_factor`: se reemplaza `id_sugerida` por `id_calculo NOT NULL REFERENCES calculo_sugerida ON DELETE CASCADE`, y `id_subfactor` pasa a `NOT NULL`. Motivo: las referencias se guardan durante el recálculo, cuando las filas de `sugerida_factor` (que exigen IL e IS) todavía no existen. Agregar `doi NOT NULL` y `UNIQUE (id_calculo, id_subfactor, doi)`.
7. `total_citas` de `sugerida_factor` = número de filas de `referencia` de los subfactores de ese factor en ese cálculo. Para el cálculo de la tesis no hay referencias: se guardan solo los totales TC de la Tabla 5.3.
8. `calculo_sugerida`: `anio_inicio` y `anio_fin` aceptan `NULL` cuando `origen = 'tesis'` (el Anexo A los tenía `NOT NULL`, pero la tesis no tiene un rango numérico); agregar `etiqueta_rango VARCHAR(60)` ("RSL de la tesis").
9. `calculo_sugerida` recibe además: `estado` (`en_proceso`|`pausado`|`completado`|`publicado`|`descartado`|`fallido`), `progreso SMALLINT` (0..18 factores con todos sus subfactores procesados), `parametros JSONB` (umbral, modelo, versión del prompt, límite de candidatos), `mensaje_error TEXT`, `creado_por UUID`. Solo un cálculo `publicado` puede quedar `vigente`.
10. Tabla nueva **`recalculo_paso`**: `id_calculo`, `id_subfactor`, `estado` (`pendiente`|`hecho`|`error`), `candidatos`, `aceptados`, `detalle TEXT`, `PRIMARY KEY (id_calculo, id_subfactor)`.
11. `evaluacion` recibe `causas JSONB` (lista de `{factor, foda, ir}` que provocan la recomendación), además de `texto_recomendacion`.
12. Más adelante (HU colaborativa): `evaluacion_participante`. No hacer ahora.

### 10.3 Row Level Security (migración `0002_rls.sql`)
RLS activado en **todas** las tablas. Función auxiliar `es_admin()` (`security definer`, lee `perfil.rol` de `auth.uid()`).

| Tabla | Leer | Escribir |
|---|---|---|
| `dimension`, `factor`, `subfactor` | Cualquier usuario autenticado | Nadie desde el cliente (solo migraciones y semilla) |
| `calculo_sugerida`, `sugerida_factor` | Cualquier usuario autenticado (el decisor necesita la IS vigente y la del cálculo de su evaluación) | Solo mediante las funciones de §11.2 |
| `referencia`, `recalculo_paso` | Solo administradores | Solo las Edge Functions (clave `service_role`) |
| `perfil` | El propio usuario | El propio usuario, sin poder cambiar `rol` |
| `organizacion`, `software_evaluado` | Su creador | Su creador |
| `evaluacion` | Su dueño | Su dueño; **no se puede modificar ni borrar si `estado = 'finalizada'`** |
| `valoracion_factor`, `valoracion_subfactor` | El dueño de la evaluación | El dueño, y solo si la evaluación está `en_curso` |

### 10.4 Semilla (criterio de aceptación de HU-01)
`scripts/generar-semilla.ts` genera `supabase/seed.sql`. Después de aplicarlo debe haber:
- 3 dimensiones, 18 factores y 61 subfactores, con las dos erratas corregidas (§4.1).
- 1 `calculo_sugerida` con origen `tesis`, `estado = 'publicado'`, `vigente = true`, `etiqueta_rango` "RSL de la tesis" y fuentes "IEEE, ACM, Scopus, WoS".
- 18 filas `sugerida_factor` con los NS, TC, IL e IS de §4.1 (no los de `factors.csv`). Verificarlo con una prueba.
- El administrador inicial no va en la semilla: se registra normalmente y se le sube el rol con un `UPDATE perfil SET rol = 'administrador'` documentado en el README (correo en la variable `ADMIN_EMAIL`).

---

## 11. Acceso a datos y contratos (Supabase)

No hay API REST propia. El cliente usa `@supabase/supabase-js` con tipos generados (`supabase gen types typescript`). Toda operación queda limitada por RLS (§10.3).

### 11.1 Operaciones desde el cliente

| Operación | Cómo | Rol |
|---|---|---|
| Registro, inicio y cierre de sesión | `supabase.auth.signUp` / `signInWithPassword` / `signOut` | público |
| Usuario y rol actual | `auth.getUser()` + `select` de `perfil` | autenticado |
| Catálogo con la IS vigente | `select` de `dimension` → `factor` → `subfactor` más `sugerida_factor` del cálculo `vigente` | autenticado |
| Historial propio (filtros: estado, texto) | `select` de `evaluacion` | decisor |
| Crear borrador | `insert` en `evaluacion` con el `id_calculo` vigente | decisor |
| Contexto (título, software, organización) | `update` de `evaluacion`; `upsert` de `software_evaluado` y `organizacion` | dueño |
| Asignar ID y alcance de un factor | `upsert` en `valoracion_factor` con `importancia_decisor`, `alcance_aplicado`, `importancia_relativa`, `es_relevante` | dueño |
| Valorar un subfactor | `upsert` en `valoracion_subfactor` y actualización de `ponderacion_global` y `clasificacion_foda` del factor | dueño |
| Finalizar | `update` de `evaluacion`: `estado = 'finalizada'`, `codigo_recomendacion`, `texto_recomendacion`, `causas`. La interfaz lo impide si no hay factores evaluados | dueño |
| Comparar | Dos lecturas de evaluaciones propias; la comparación se arma en el cliente | dueño de ambas |
| Historial y detalle de cálculos de IS | `select` de `calculo_sugerida`, `sugerida_factor`, `referencia` | admin |

### 11.2 Funciones SQL (RPC, `security definer`, verifican `es_admin()`)

| Función | Qué hace |
|---|---|
| `conteo_citas(p_id_calculo)` | Devuelve por factor: `num_subfactores` y `total_citas` (filas de `referencia`) |
| `guardar_resultado_calculo(p_id_calculo, p_filas jsonb)` | Inserta las 18 filas de `sugerida_factor` (n, citas, razón, IE, IL, IS) y deja el cálculo en `completado`. Falla si no son exactamente 18 o si quedan pasos pendientes |
| `publicar_calculo(p_id_calculo)` | En una transacción: desmarca el vigente anterior y marca este como `publicado` y `vigente` |
| `descartar_calculo(p_id_calculo)` | Estado `descartado`. No se puede descartar el vigente |

### 11.3 Edge Functions (exigen JWT de un administrador; responden 403 a un decisor)

| Función | Entrada | Salida |
|---|---|---|
| `POST /functions/v1/recalculo-iniciar` | `{anio_inicio, anio_fin, fuentes[]}` | Crea el `calculo_sugerida` (`en_proceso`) y los 61 `recalculo_paso`. Devuelve `{id_calculo}` |
| `POST /functions/v1/recalculo-paso` | `{id_calculo}` | Procesa un subfactor pendiente (§13.2) y devuelve `{progreso, pendientes, estado}` |

Errores con `{error, codigo}` y un mensaje legible en español.

---

## 12. Frontend

### 12.1 Referencia
`COMPONENTE PRACTICO 1/prototipo/GUIOS_PRO_2.0_prototipo.html` es **la especificación visual y de interacción**. Los 21 PNG de `img_cp1/` sirven de apoyo.

| ID | Pantalla | Ruta |
|---|---|---|
| P-01 | Inicio de sesión / registro | `/login` |
| P-02 | Inicio e historial | `/` |
| P-03 | Contexto | `/evaluaciones/:id/contexto` |
| P-04 | Factores (pasos 1 y 2) | `/evaluaciones/:id/factores` |
| P-05 | Subfactores (pasos 3 y 4) | `/evaluaciones/:id/subfactores?factor=` |
| P-06 | Resultados (pasos 5 y 6) | `/evaluaciones/:id/resultados` (informe imprimible en `/evaluaciones/:id/informe`) |
| P-07 | Comparar | `/comparar?a=&b=` |
| P-08 | Importancia sugerida | `/admin/sugerida` |
| P-09 | Nuevo recálculo | `/admin/sugerida/nuevo` y `/admin/sugerida/:id` |
| P-10 | Detalle de cálculo | panel lateral sobre P-08 |
| P-11 | Ayuda del método | modal global |

### 12.2 Decisiones de UX que no se negocian (vienen del piloto de la tesis)
- Subfactores: **un clic por subfactor**, todos visibles y guardado automático (el piloto tardó 25 min con deslizador, lista y botón guardar).
- Resultados: mostrar **las causas de la recomendación** y permitir **ir del factor de la matriz FODA a sus subfactores**.
- La IS visible junto a cada factor, con una ayuda que explique de dónde sale (IE, IL y cálculo vigente).
- El color nunca va solo: siempre acompañado del texto del nivel o la clasificación.

### 12.3 Tokens de diseño (CP1)
`--navy #1B3047` · `--orange #F28C1B` · `--bg #F3F5F8` · `--text #1B2533` · FODA: F `#2E8B57`, O `#2F6FB3`, D `#C9701C`, A `#C0392B` · Rec. B `#D4A017` · Importancia 1→4: `#9AA6B5`, `#6FA3D8`, `#2F6FB3`, `#1B3047` · Fuente **Inter** · Tamaños: 22 / 14 / 12 px · Radio 12 px · Punto de quiebre móvil: 760 px (barra inferior de navegación, stepper reducido y tablas convertidas en tarjetas).

---

## 13. Módulo de importancia sugerida con IA y APIs externas

### 13.1 APIs que se usan

| API | Para qué | Credencial | Costo (verificado el 17/11/2026) |
|---|---|---|---|
| **OpenAlex** | Búsqueda principal de artículos | API key gratuita (cuenta en openalex.org → openalex.org/settings/api); obligatoria desde febrero de 2026 | Gratis: 1 USD de uso diario incluido, de sobra para un recálculo |
| **Crossref REST** | Segunda fuente | Sin clave; correo en el parámetro `mailto` | Gratis |
| **Gemini API**, modelo `gemini-3.1-flash-lite` | Clasificar candidatos | API key de Google AI Studio | Nivel gratuito; de pago 0,25 USD/M tokens de entrada y 1,50 USD/M de salida ≈ 0,70 USD por recálculo completo (estimado) |

- HU-01 a HU-06 y HU-09 a HU-17 **no usan ninguna API externa**. Solo HU-07 y HU-08.
- Fuera del MVP: Semantic Scholar, IEEE Xplore y Scopus (la versión anterior del brief los listaba como opcionales). La interfaz `ProveedorBusqueda` permite agregarlos después.
- Respaldo opcional del clasificador: cualquier proveedor compatible con la API de OpenAI (por ejemplo DeepSeek). No se implementa ahora; la interfaz `Clasificador` lo permite.
- En el nivel gratuito de Gemini, Google puede usar lo enviado para mejorar sus productos: solo se envían títulos y resúmenes públicos, nunca datos de evaluaciones ni de usuarios.

### 13.2 Pipeline
Supabase Edge Functions en plan Free viven 150 s como máximo y tienen 2 s de CPU por invocación, así que el recálculo **no** es una función larga: es una invocación corta por subfactor.

1. **Contexto semántico.** Para cada uno de los 61 subfactores se mantiene una descripción ampliada (sinónimos en inglés y español, cómo aparece en artículos) en `supabase/functions/_shared/contexto_subfactores.json`, versionado. El agente genera la primera versión y el equipo la revisa una vez.
2. **Inicio.** `recalculo-iniciar` crea el cálculo y los 61 pasos `pendiente`.
3. **Paso (uno por subfactor).** `recalculo-paso` toma un paso pendiente y:
   a. arma la consulta: (*open source software adoption / FLOSS adoption*) + factor + términos del subfactor;
   b. busca en OpenAlex y Crossref con filtro de años y tipo artículo;
   c. normaliza el DOI (minúsculas, sin `https://doi.org/`), descarta candidatos sin DOI y deduplica;
   d. recorta a `RECALCULO_MAX_CANDIDATOS` y clasifica en lotes de 10;
   e. guarda en `referencia` los aceptados (título, año, DOI, base, subfactor), marca el paso `hecho` y actualiza `progreso`.
4. **Bucle.** La pantalla P-09 invoca `recalculo-paso` hasta que no queden pendientes y muestra el progreso (0..18 factores). Si se cierra la pestaña, al volver se retoma desde lo pendiente. Los pasos son idempotentes gracias al `UNIQUE (id_calculo, id_subfactor, doi)`.
5. **Conteo y cálculo.** Con `conteo_citas`, las citas de cada subfactor son el número de artículos aceptados y `c_i` es la suma de los subfactores del factor. `guios-core/literatura` calcula `r_i`, cuartiles, IL e IS (RN-09 y RN-10) y se guarda con `guardar_resultado_calculo`.
6. **Revisión y publicación.** El administrador compara la IS nueva con la vigente (P-09) y la **publica** o la **descarta**.

### 13.3 Llamadas concretas

**OpenAlex**
`GET https://api.openalex.org/works?search=<términos>&filter=publication_year:<inicio>-<fin>,type:article&per_page=100&select=id,doi,title,publication_year,abstract_inverted_index&api_key=<KEY>`
El resumen llega como índice invertido (`abstract_inverted_index`): hay que reconstruir el texto.

**Crossref**
`GET https://api.crossref.org/works?query.bibliographic=<términos>&filter=from-pub-date:<inicio>-01-01,until-pub-date:<fin>-12-31,type:journal-article&rows=50&select=DOI,title,issued,abstract&mailto=<correo>`
Consultas en serie, máximo 1 por segundo; respetar las cabeceras `x-rate-limit-*`. Muchos registros no traen resumen: se clasifica solo con el título.

**Gemini**
Salida estructurada JSON, `temperature: 0`. Entrada: factor, subfactor, contexto y una lista numerada de hasta 10 candidatos (título + resumen). Salida:
`[{"indice": n, "trata_subfactor": bool, "confianza": 0-1, "evidencia": "frase"}]`
Se acepta si `trata_subfactor` y `confianza ≥ umbral` (configurable; por defecto 0,7). Todo `indice` que no exista en la lista se descarta.

### 13.4 Interfaces (RNF-07)
```ts
interface ProveedorBusqueda {
  nombre: 'openalex' | 'crossref'
  buscar(consulta: string, anioInicio: number, anioFin: number, limite: number): Promise<Candidato[]>
}
interface Clasificador {
  clasificar(factor: string, subfactor: string, contexto: string, candidatos: Candidato[]): Promise<Veredicto[]>
}
```
Implementaciones: `OpenAlexProveedor`, `CrossrefProveedor`, `GeminiClasificador`. Para pruebas y demo: `ProveedorFalso` (respuestas grabadas) y `ClasificadorFalso` (determinista), elegidos con `LLM_PROVIDER=fake`.

### 13.5 Cuidados
- **La IA no busca por su cuenta**: busca la API bibliográfica y la IA **solo clasifica**. Así no se inventan referencias. Toda referencia guardada tiene un DOI que vino de OpenAlex o Crossref.
- Guardar en `calculo_sugerida.parametros` los años, fuentes, umbral, modelo, versión del prompt y límite (RNF-09).
- Un 429 o una caída de cualquier API deja el cálculo en `pausado` con `mensaje_error` legible; se reanuda desde P-09. No se reintenta en bucle.
- Un recálculo fallido o pausado nunca afecta a las evaluaciones: sigue vigente el cálculo anterior.
- Los resultados no son comparables en magnitud con la tesis (otra base de artículos), pero IL es relativa por cuartiles, así que la escala no afecta.

### 13.6 Modo demostración para el cliente
- `LLM_PROVIDER=fake`: la demo funciona sin red ni cuota y siempre da el mismo resultado. Es el modo de las pruebas y del CI.
- Demo real con poco gasto: `RECALCULO_MAX_CANDIDATOS=15` deja el recálculo en unas 900 clasificaciones (unas 90 llamadas al LLM).

### 13.7 Variables de entorno

| Variable | Dónde | Tipo |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Vercel y `.env.local` | Públicas |
| `SUPABASE_SERVICE_ROLE_KEY` | Secretos de Supabase (la inyecta la plataforma en las Edge Functions) | Secreta |
| `OPENALEX_API_KEY` | Secretos de Supabase | Secreta |
| `CROSSREF_MAILTO` | Secretos de Supabase | Correo del equipo |
| `LLM_PROVIDER` | Secretos de Supabase | `gemini` \| `fake` |
| `GEMINI_API_KEY` | Secretos de Supabase | Secreta |
| `LLM_MODEL` | Secretos de Supabase | `gemini-3.1-flash-lite` |
| `LLM_UMBRAL` | Secretos de Supabase | `0.7` |
| `RECALCULO_MAX_CANDIDATOS` | Secretos de Supabase | `50` (`15` para la demo) |
| `ADMIN_EMAIL` | Solo README / paso manual | Correo del administrador inicial |

Solo las variables `VITE_` llegan al navegador. Ninguna clave se sube al repositorio.

---

## 14. Seguridad
- Contraseñas y sesiones a cargo de Supabase Auth; mínimo 8 caracteres (configurarlo en el proyecto). Para la demo, desactivar la confirmación de correo o documentar cómo confirmar.
- RLS en todas las tablas (§10.3). El cliente solo usa la clave pública (`anon`); la clave `service_role` existe únicamente dentro de las Edge Functions.
- Autorización por recurso: la evaluación pertenece a `auth.uid()`; las funciones de §11.2 y §11.3 exigen rol administrador.
- Dominios cerrados con `CHECK` en la BD (niveles 1..4, estados, FODA) y validación equivalente en `guios-core`.
- Las Edge Functions validan su entrada y solo aceptan el origen del frontend (CORS).
- HTTPS en Vercel y Supabase por defecto.
- Respaldo (RNF-06): el plan Free de Supabase no garantiza respaldos; el README documenta un `supabase db dump` manual antes de cada entrega.

---

## 15. Calidad, pruebas y proceso (Scrum + Git)

### 15.1 Definición de terminado (de la Tarea 1, ampliada)
Una historia está terminada cuando:
- El código está revisado por al menos otro integrante en un PR.
- Está integrado a `main` y desplegado en Vercel.
- El CI está en verde: lint, tipos, pruebas y build.
- Pasan los golden tests si toca la lógica.
- La cobertura de `src/guios-core/` es ≥ 95 %.
- El README y la documentación están actualizados.
- El Product Owner la aceptó en ClickUp (estado Done).

### 15.2 Flujo Git
- `main` protegida; ramas `feat/HU-xx-descripcion`, `fix/…` y `docs/…`.
- Commits con el formato *Conventional Commits* (`feat(evaluaciones): valorar subfactores HU-04`).
- Una historia por PR, con la plantilla de PR: HU, criterios de aceptación y evidencia.
- El tablero Scrum es ClickUp (estados To Do → In Progress → Testing → Done); cada PR menciona su HU y su tarea (S1-T03, etc.).

### 15.3 Pirámide de pruebas
- **Unitarias (`guios-core`)**: reglas y fixtures de §6.
- **Base de datos**: con Supabase local (`supabase start`), prueba de la semilla (3/18/61 y las 18 IS) y pruebas de RLS (un usuario no lee la evaluación de otro; un decisor no publica cálculos).
- **Edge Functions**: proveedores y clasificador con los falsos; un índice inexistente devuelto por el clasificador se descarta; un decisor recibe 403.
- **Frontend**: componentes (selector, matriz FODA).
- **E2E (Playwright)**: el recorrido del piloto LibreOffice de punta a punta termina en una recomendación C.

### 15.4 Métricas para la asignatura
Velocidad por sprint, burndown, cobertura, defectos encontrados en revisión y tiempo de ciclo por historia. Relacionarlas con las características de ISO/IEC 25010 en los informes de sprint.

---

## 16. Plan de construcción con criterios de aceptación

Sigue la planificación cargada en ClickUp (Tarea 2). Sprints de 3 días; entrega el lunes 23/11/2026. El agente construye en este orden y no empieza una fase sin cerrar los criterios de la anterior.

| Fase | Sprint (ClickUp) | Objetivo | Historias | Pts | Criterios de aceptación clave |
|---|---|---|---|---|---|
| **1** | Sprint 1 (14–16/11) | Base técnica, catálogo y factores | HU-01, HU-02, HU-03 | 15 | Repositorio con la estructura de §9 y CI en verde; despliegue en Vercel; migraciones y semilla dejan 3/18/61 y el cálculo de la tesis vigente; inicio de sesión básico y RLS activos; `guios-core` pasa los fixtures 6.1 y 6.2; P-04 asigna la ID con un clic y muestra IR y relevancia; Soporte con selector de alcance |
| **2** | Sprint 2 (17–19/11) | Flujo completo de evaluación | HU-04, HU-05, HU-06 | 21 | P-05 con un clic y autoguardado; PM en vivo; FODA según RN-07; recomendación según RN-08 con causas (P-06); el E2E del piloto LibreOffice da C; pasan los casos borde de 6.4 |
| **3** | Sprint 3 (20–22/11) | IS recalculable con IA | HU-07, HU-08 | 21 | Recálculo por pasos con progreso y reanudación; OpenAlex y Crossref; clasificador con falso en las pruebas; `c_i` por subfactor; IL e IS con `guios-core`; publicar y descartar; solo un cálculo vigente; criterios de §13.5 |
| Backlog | — | Iteraciones futuras | HU-09 a HU-17 | 57 | No se construyen ahora, salvo lo indicado abajo |

**Dependencia que el plan original no contemplaba.** HU-13 (registro e inicio de sesión) está en el backlog, pero las fases 1 a 3 necesitan usuarios, dueño de la evaluación y rol administrador. Por eso la **Fase 1 incluye como tarea técnica** (dentro de S1-T03): Supabase Auth con correo y contraseña, tabla `perfil` con rol, RLS de §10.3 y una pantalla P-01 mínima. Lo que queda para HU-13 es el pulido de P-01 y la gestión de la cuenta.

**Fase 1, tareas en orden**
1. Repositorio con la estructura de §9, README, `.env.example`, plantilla de PR, ESLint, Prettier y GitHub Actions.
2. Proyecto Vite + React + TypeScript, `vercel.json` y primer despliegue.
3. `supabase init`; migraciones `0001_esquema.sql` (Anexo A con los ajustes de §10.2), `0002_rls.sql`, `0003_funciones.sql`.
4. `scripts/generar-semilla.ts` y la prueba de la semilla.
5. `guios-core`: `escalas`, `reglas`, `literatura`, `textos` y los cuatro fixtures de §6, portando la lógica del prototipo del CP1.
6. Cliente Supabase, tipos generados, P-01 mínima y guardas de ruta por rol.
7. Consulta del catálogo con la IS vigente y pantalla P-04.
8. Registrar en `docs/decisiones/` los ADR-001, ADR-002 y ADR-003.

**Qué entrega el equipo al agente antes de empezar** (el agente no puede crearlo por sí mismo)
- Repositorio vacío en GitHub (`usuario/guios-pro-2`) y proyecto de Vercel conectado a él.
- Proyecto de Supabase: URL, clave `anon` y acceso para aplicar migraciones (token de la CLI o contraseña de la BD).
- Para la Fase 3: `OPENALEX_API_KEY`, `GEMINI_API_KEY` y el correo para `CROSSREF_MAILTO`.
- La carpeta de fuentes de §3.

Si falta alguno, el agente trabaja contra Supabase local (`supabase start`) y con `LLM_PROVIDER=fake`, y lo deja anotado en el README.

---

## 17. Pendientes por validar con el docente
Siguen abiertos con el docente. **El agente no espera la respuesta:** implementa el valor indicado en cada punto y deja el umbral de relevancia, el método de cuartiles y el umbral de confianza como constantes con nombre en `guios-core`, para poder cambiarlos en un solo lugar.
1. Confirmar que el umbral de relevancia es **IR > 1**. La tesis y la versión web coinciden; `guiosad.py` tiene una función sin usar con `> 2`.
2. Confirmar que no se usa el mensaje de conteo de factores buenos y malos del prototipo, sino solo la recomendación A, B o C.
3. Confirmar las IS de Usabilidad (2) y Apoyo de la alta dirección (3) según la Tabla 5.3.
4. Confirmar el método de cuartiles: la interpolación lineal (y también la variante "inferior") reproduce la Tabla 5.3.
5. Confirmar que `c_i` = suma de citas por subfactor.
6. Validar las fuentes bibliográficas para el recálculo. Por defecto: OpenAlex y Crossref (§13.1).
7. Confirmar si la evaluación colaborativa entra o no en el alcance. Por defecto: no entra.
8. Confirmar el cambio de stack: Vercel + Supabase en lugar de FastAPI y contenedores (§8.1). Afecta a RNF-08 de la Tarea 1. Por defecto: se construye con Vercel + Supabase.

---

## 18. Prompt de arranque sugerido

> Lee completo `BRIEF.md` y los archivos de `docs/fuentes/`. Vamos a ejecutar la **Fase 1** (§16) de GUIOS PRO 2.0 con el stack de §8.1: React + TypeScript + Vite en Vercel, Supabase (PostgreSQL, Auth, RLS, Edge Functions) y la lógica en `src/guios-core/`. Sigue las tareas de la Fase 1 en orden: estructura de §9, migraciones a partir del Anexo A con los ajustes de §10.2 y las políticas de §10.3, semilla de §10.4 (usa `guiosad_data.csv` y la tabla de §4.1, no `factors.csv`), `guios-core` con las reglas de §4.3 portadas del prototipo y los golden tests de §6, inicio de sesión mínimo y la pantalla P-04 tomando como referencia `GUIOS_PRO_2.0_prototipo.html`. Respeta las trampas de §5 y no preguntes por los puntos de §17: usa los valores por defecto. No uses ninguna API externa en esta fase. Trabaja en ramas `feat/HU-01…`, `feat/HU-02…` y `feat/HU-03…` con commits convencionales, y al final dime qué criterios de aceptación de la Fase 1 quedan cumplidos, cuáles no y qué credenciales te faltaron.

Para las fases 2 y 3 se repite el mismo prompt cambiando el número de fase. En la Fase 3, agregar: "Empieza con `LLM_PROVIDER=fake` y respuestas grabadas; conecta OpenAlex, Crossref y Gemini solo cuando las pruebas pasen con los falsos".

---

## 19. Glosario
| Sigla | Significado |
|---|---|
| GUIOS | Guía para evaluar la adopción de FLOSS en organizaciones (tesis) |
| GUIOS PRO | Prototipo que automatiza GUIOS (Flexx/Python) |
| FLOSS | Free/Libre and Open Source Software |
| IE | Importancia del experto (encuesta; fija en 3) |
| IL | Importancia de la literatura (cuartiles de citas por subfactor) |
| IS | Importancia sugerida = intersección(IE, IL) |
| ID | Importancia del decisor |
| IR | Importancia relativa = intersección(ID, IS) |
| PS | Ponderación (cumplimiento) del subfactor, 1..4 |
| PM | Ponderación media del factor |
| FODA | Fortalezas, Oportunidades, Debilidades, Amenazas |
| RSL | Revisión sistemática de la literatura |
| HU | Historia de usuario |
| ADR | Architecture Decision Record (registro de decisión técnica) |

**Referencias base:** Rea Sánchez, V. H. (2022). *Factores para la adopción de soluciones basadas en software libre* [Tesis doctoral, Universidad de Sevilla] · Schwaber, K. & Sutherland, J. (2020). *The Scrum Guide* · ISO/IEC 25010:2011 · Tarea 1 y Componente Práctico 1 del equipo.
