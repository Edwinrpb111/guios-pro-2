-- 0001_esquema.sql — esquema de GUIOS PRO 2.0.
-- Parte del Anexo A de la Tarea 1 (docs/fuentes/anexo_a_tarea1.sql) con los ajustes
-- obligatorios de BRIEF §10.2; cada ajuste está listado en docs/decisiones/ADR-003-esquema-supabase.md.

-- ---------------------------------------------------------------------------
-- Transaccional: organizaciones y perfiles
-- ---------------------------------------------------------------------------
create table public.organizacion (
  id_organizacion integer generated always as identity primary key,
  nombre          varchar(150) not null,
  sector          varchar(100),
  pais            varchar(60),
  -- Ajuste 4: dueño de la fila, necesario para RLS.
  creado_por      uuid not null default auth.uid() references auth.users (id) on delete cascade
);
create index organizacion_creado_por_idx on public.organizacion (creado_por);

-- Ajuste 1: `usuario` se reemplaza por `perfil`; correo y clave los guarda Supabase Auth.
create table public.perfil (
  id              uuid primary key references auth.users (id) on delete cascade,
  id_organizacion integer references public.organizacion (id_organizacion) on delete set null,
  nombre_completo varchar(150) not null,
  rol             varchar(15) not null default 'decisor'
                  check (rol in ('decisor', 'administrador')),
  fecha_registro  timestamptz not null default now()
);

create table public.software_evaluado (
  id_software     integer generated always as identity primary key,
  id_organizacion integer references public.organizacion (id_organizacion) on delete set null,
  nombre          varchar(150) not null,
  version         varchar(40),
  tipo_licencia   varchar(60),
  descripcion     text,
  -- Ajuste 4.
  creado_por      uuid not null default auth.uid() references auth.users (id) on delete cascade
);
create index software_evaluado_creado_por_idx on public.software_evaluado (creado_por);

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------
create table public.dimension (
  id_dimension integer generated always as identity primary key,
  nombre       varchar(100) not null unique
);

create table public.factor (
  id_factor           integer generated always as identity primary key,
  id_dimension        integer not null references public.dimension (id_dimension),
  nombre              varchar(120) not null unique,
  importancia_experto smallint not null default 3 check (importancia_experto between 1 and 4),
  alcance             varchar(7) not null check (alcance in ('Interno', 'Externo', 'Ambos')),
  orden               smallint not null
);

create table public.subfactor (
  id_subfactor integer generated always as identity primary key,
  id_factor    integer not null references public.factor (id_factor),
  enunciado    text not null,
  orden        smallint not null
);
create index subfactor_id_factor_idx on public.subfactor (id_factor);

-- ---------------------------------------------------------------------------
-- Importancia sugerida
-- ---------------------------------------------------------------------------
create table public.calculo_sugerida (
  id_calculo     integer generated always as identity primary key,
  origen         varchar(5) not null check (origen in ('tesis', 'ia')),
  -- Ajuste 8: sin rango numérico para el cálculo de la tesis.
  anio_inicio    smallint,
  anio_fin       smallint,
  etiqueta_rango varchar(60),
  bases_datos    varchar(200),
  fecha_calculo  timestamptz not null default now(),
  vigente        boolean not null default false,
  -- Ajuste 9: estado y seguimiento del recálculo.
  estado         varchar(10) not null default 'en_proceso'
                 check (estado in ('en_proceso', 'pausado', 'completado', 'publicado', 'descartado', 'fallido')),
  progreso       smallint not null default 0 check (progreso between 0 and 18),
  parametros     jsonb,
  mensaje_error  text,
  creado_por     uuid default auth.uid() references auth.users (id) on delete set null,
  constraint calculo_rango_valido check (anio_fin >= anio_inicio),
  constraint calculo_rango_requerido
    check (origen = 'tesis' or (anio_inicio is not null and anio_fin is not null)),
  constraint calculo_vigente_publicado check (not vigente or estado = 'publicado')
);
-- Trampa 10: solo un cálculo puede estar vigente.
create unique index uq_calculo_vigente on public.calculo_sugerida (vigente) where vigente;

create table public.sugerida_factor (
  id_sugerida            integer generated always as identity primary key,
  id_calculo             integer not null references public.calculo_sugerida (id_calculo) on delete cascade,
  id_factor              integer not null references public.factor (id_factor),
  num_subfactores        smallint not null check (num_subfactores > 0),
  -- Ajuste 7: filas de `referencia` del factor (en la tesis, el TC de la Tabla 5.3).
  total_citas            integer not null check (total_citas >= 0),
  razon_citas            numeric(8, 4) not null,
  importancia_experto    smallint not null check (importancia_experto between 1 and 4),
  importancia_literatura smallint not null check (importancia_literatura between 1 and 4),
  importancia_sugerida   smallint not null check (importancia_sugerida between 1 and 4),
  unique (id_calculo, id_factor)
);

-- Ajuste 6: la referencia cuelga del cálculo y del subfactor (trampa 6).
create table public.referencia (
  id_referencia integer generated always as identity primary key,
  id_calculo    integer not null references public.calculo_sugerida (id_calculo) on delete cascade,
  id_subfactor  integer not null references public.subfactor (id_subfactor),
  titulo        varchar(500) not null,
  anio          smallint not null,
  doi           varchar(200) not null,
  base_datos    varchar(40),
  unique (id_calculo, id_subfactor, doi)
);
create index referencia_id_subfactor_idx on public.referencia (id_subfactor);

-- Ajuste 10: un paso por subfactor del recálculo.
create table public.recalculo_paso (
  id_calculo   integer not null references public.calculo_sugerida (id_calculo) on delete cascade,
  id_subfactor integer not null references public.subfactor (id_subfactor),
  estado       varchar(9) not null default 'pendiente' check (estado in ('pendiente', 'hecho', 'error')),
  candidatos   integer not null default 0 check (candidatos >= 0),
  aceptados    integer not null default 0 check (aceptados >= 0),
  detalle      text,
  primary key (id_calculo, id_subfactor)
);

-- ---------------------------------------------------------------------------
-- Evaluaciones (los valores derivados se guardan como fotografía, trampa 9)
-- ---------------------------------------------------------------------------
create table public.evaluacion (
  id_evaluacion        integer generated always as identity primary key,
  -- Ajuste 3.
  id_usuario           uuid not null default auth.uid() references public.perfil (id) on delete cascade,
  id_software          integer references public.software_evaluado (id_software) on delete set null,
  id_calculo           integer not null references public.calculo_sugerida (id_calculo),
  titulo               varchar(150),
  fecha_creacion       timestamptz not null default now(),
  fecha_actualizacion  timestamptz not null default now(),
  estado               varchar(12) not null default 'en_curso' check (estado in ('en_curso', 'finalizada')),
  codigo_recomendacion char(1) check (codigo_recomendacion in ('A', 'B', 'C')),
  texto_recomendacion  text,
  -- Ajuste 11: factores que causan la recomendación, [{factor, foda, ir}].
  causas               jsonb check (causas is null or jsonb_typeof(causas) = 'array')
);
create index evaluacion_id_usuario_idx on public.evaluacion (id_usuario);
create index evaluacion_id_calculo_idx on public.evaluacion (id_calculo);

create table public.valoracion_factor (
  id_val_factor        integer generated always as identity primary key,
  id_evaluacion        integer not null references public.evaluacion (id_evaluacion) on delete cascade,
  id_factor            integer not null references public.factor (id_factor),
  importancia_decisor  smallint not null default 1 check (importancia_decisor between 1 and 4),
  importancia_relativa smallint check (importancia_relativa between 1 and 4),
  es_relevante         boolean not null default false,
  alcance_aplicado     varchar(7) not null default 'Interno' check (alcance_aplicado in ('Interno', 'Externo')),
  ponderacion_global   numeric(3, 2) check (ponderacion_global between 1 and 4),
  clasificacion_foda   varchar(11)
                       check (clasificacion_foda in ('Fortaleza', 'Oportunidad', 'Debilidad', 'Amenaza')),
  unique (id_evaluacion, id_factor)
);

create table public.valoracion_subfactor (
  id_val_subfactor   integer generated always as identity primary key,
  id_val_factor      integer not null references public.valoracion_factor (id_val_factor) on delete cascade,
  id_subfactor       integer not null references public.subfactor (id_subfactor),
  nivel_cumplimiento smallint not null default 1 check (nivel_cumplimiento between 1 and 4),
  unique (id_val_factor, id_subfactor)
);
