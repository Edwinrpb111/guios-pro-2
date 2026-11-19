-- 20261124100000_trazabilidad_referencias.sql — trazabilidad de referencias (issue #46, S17).
-- Migración aditiva: no toca datos existentes ni migraciones ya desplegadas.
-- Hasta ahora solo se guardaban los artículos aceptados (título, año, DOI, base) y se perdía el
-- veredicto de la IA. Esta migración guarda el porqué:
-- * `referencia` (aceptadas) gana `confianza` y `evidencia`. Quedan en NULL en los cálculos
--   anteriores a esta migración: la pantalla los muestra como «sin datos de clasificación».
-- * `referencia_rechazada` guarda los candidatos que la IA SÍ clasificó y descartó
--   (`trata_subfactor` falso o confianza bajo el umbral). No guarda los que se descartaron antes
--   de clasificar (sin DOI o fuera del rango de años) ni los índices inválidos que devuelva la IA.
-- La `evidencia` es texto de la IA sobre títulos y resúmenes ajenos: se trata como NO confiable
-- (texto plano, recortado a 500 caracteres, nunca como HTML ni instrucción). Ver ADR-015.
-- Escritura SOLO desde la Edge Function recalculo-paso (service_role); lectura solo del
-- administrador.

alter table public.referencia
  add column confianza numeric check (confianza between 0 and 1),
  add column evidencia varchar(500);

create table public.referencia_rechazada (
  id_referencia_rechazada integer generated always as identity primary key,
  id_calculo              integer not null references public.calculo_sugerida (id_calculo) on delete cascade,
  id_subfactor            integer not null references public.subfactor (id_subfactor),
  titulo                  varchar(500) not null,
  anio                    smallint not null,
  doi                     varchar(200) not null,
  base_datos              varchar(40),
  confianza               numeric check (confianza between 0 and 1),
  evidencia               varchar(500),
  unique (id_calculo, id_subfactor, doi)
);
create index referencia_rechazada_id_subfactor_idx on public.referencia_rechazada (id_subfactor);

alter table public.referencia_rechazada enable row level security;

-- Lectura solo para administradores; sin políticas de escritura, RLS bloquea insert/update/delete
-- del cliente. Se quitan además los privilegios para que falle de forma explícita (42501).
create policy "recalculo: leer admin" on public.referencia_rechazada
  for select to authenticated using ((select public.es_admin()));
revoke insert, update, delete on public.referencia_rechazada from anon, authenticated;
