-- Anexo A de la Tarea 1 (S4-TAREA_1 NUEVA.pdf): script SQL del diseño físico (PostgreSQL).
-- Copia fiel del original, solo reformateada al extraerla del PDF y con las comillas ’ cambiadas por '.
-- NO se ejecuta: las migraciones de supabase/migrations/ parten de aquí con los ajustes de
-- BRIEF §10.2, documentados en docs/decisiones/ADR-003-esquema-supabase.md.

CREATE TABLE organizacion (
  id_organizacion INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre          VARCHAR(150) NOT NULL,
  sector          VARCHAR(100),
  pais            VARCHAR(60)
);

CREATE TABLE usuario (
  id_usuario      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_organizacion INTEGER REFERENCES organizacion(id_organizacion) ON DELETE SET NULL,
  nombre_completo VARCHAR(150) NOT NULL,
  correo          VARCHAR(150) NOT NULL UNIQUE,
  clave_hash      VARCHAR(255) NOT NULL,
  rol             VARCHAR(15) NOT NULL DEFAULT 'decisor'
                  CHECK (rol IN ('decisor', 'administrador')),
  fecha_registro  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE software_evaluado (
  id_software     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_organizacion INTEGER REFERENCES organizacion(id_organizacion) ON DELETE SET NULL,
  nombre          VARCHAR(150) NOT NULL,
  version         VARCHAR(40),
  tipo_licencia   VARCHAR(60),
  descripcion     TEXT
);

CREATE TABLE dimension (
  id_dimension INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre       VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE factor (
  id_factor           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_dimension        INTEGER NOT NULL REFERENCES dimension(id_dimension),
  nombre              VARCHAR(120) NOT NULL UNIQUE,
  importancia_experto SMALLINT NOT NULL DEFAULT 3
                      CHECK (importancia_experto BETWEEN 1 AND 4),
  alcance             VARCHAR(7) NOT NULL
                      CHECK (alcance IN ('Interno', 'Externo', 'Ambos')),
  orden               SMALLINT NOT NULL
);

CREATE TABLE subfactor (
  id_subfactor INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_factor    INTEGER NOT NULL REFERENCES factor(id_factor),
  enunciado    TEXT NOT NULL,
  orden        SMALLINT NOT NULL
);

CREATE TABLE calculo_sugerida (
  id_calculo    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  origen        VARCHAR(5) NOT NULL CHECK (origen IN ('tesis', 'ia')),
  anio_inicio   SMALLINT NOT NULL,
  anio_fin      SMALLINT NOT NULL,
  bases_datos   VARCHAR(200),
  fecha_calculo TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  vigente       BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (anio_fin >= anio_inicio)
);

-- Solo un calculo puede estar vigente
CREATE UNIQUE INDEX uq_calculo_vigente ON calculo_sugerida (vigente) WHERE vigente;

CREATE TABLE sugerida_factor (
  id_sugerida            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_calculo             INTEGER NOT NULL REFERENCES calculo_sugerida(id_calculo) ON DELETE CASCADE,
  id_factor              INTEGER NOT NULL REFERENCES factor(id_factor),
  num_subfactores        SMALLINT NOT NULL CHECK (num_subfactores > 0),
  total_citas            INTEGER NOT NULL CHECK (total_citas >= 0),
  razon_citas            NUMERIC(8,4) NOT NULL,
  importancia_experto    SMALLINT NOT NULL CHECK (importancia_experto BETWEEN 1 AND 4),
  importancia_literatura SMALLINT NOT NULL CHECK (importancia_literatura BETWEEN 1 AND 4),
  importancia_sugerida   SMALLINT NOT NULL CHECK (importancia_sugerida BETWEEN 1 AND 4),
  UNIQUE (id_calculo, id_factor)
);

CREATE TABLE referencia (
  id_referencia INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_sugerida   INTEGER NOT NULL REFERENCES sugerida_factor(id_sugerida) ON DELETE CASCADE,
  id_subfactor  INTEGER REFERENCES subfactor(id_subfactor),
  titulo        VARCHAR(500) NOT NULL,
  anio          SMALLINT NOT NULL,
  doi           VARCHAR(200),
  base_datos    VARCHAR(40)
);

CREATE TABLE evaluacion (
  id_evaluacion        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_usuario           INTEGER NOT NULL REFERENCES usuario(id_usuario),
  id_software          INTEGER REFERENCES software_evaluado(id_software) ON DELETE SET NULL,
  id_calculo           INTEGER NOT NULL REFERENCES calculo_sugerida(id_calculo),
  titulo               VARCHAR(150),
  fecha_creacion       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado               VARCHAR(12) NOT NULL DEFAULT 'en_curso'
                       CHECK (estado IN ('en_curso', 'finalizada')),
  codigo_recomendacion CHAR(1) CHECK (codigo_recomendacion IN ('A', 'B', 'C')),
  texto_recomendacion  TEXT
);

CREATE TABLE valoracion_factor (
  id_val_factor        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_evaluacion        INTEGER NOT NULL REFERENCES evaluacion(id_evaluacion) ON DELETE CASCADE,
  id_factor            INTEGER NOT NULL REFERENCES factor(id_factor),
  importancia_decisor  SMALLINT NOT NULL DEFAULT 1 CHECK (importancia_decisor BETWEEN 1 AND 4),
  importancia_relativa SMALLINT CHECK (importancia_relativa BETWEEN 1 AND 4),
  es_relevante         BOOLEAN NOT NULL DEFAULT FALSE,
  alcance_aplicado     VARCHAR(7) NOT NULL DEFAULT 'Interno'
                       CHECK (alcance_aplicado IN ('Interno', 'Externo')),
  ponderacion_global   NUMERIC(3,2) CHECK (ponderacion_global BETWEEN 1 AND 4),
  clasificacion_foda   VARCHAR(11)
                       CHECK (clasificacion_foda IN ('Fortaleza', 'Oportunidad', 'Debilidad', 'Amenaza')),
  UNIQUE (id_evaluacion, id_factor)
);

CREATE TABLE valoracion_subfactor (
  id_val_subfactor   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id_val_factor      INTEGER NOT NULL REFERENCES valoracion_factor(id_val_factor) ON DELETE CASCADE,
  id_subfactor       INTEGER NOT NULL REFERENCES subfactor(id_subfactor),
  nivel_cumplimiento SMALLINT NOT NULL DEFAULT 1 CHECK (nivel_cumplimiento BETWEEN 1 AND 4),
  UNIQUE (id_val_factor, id_subfactor)
);
