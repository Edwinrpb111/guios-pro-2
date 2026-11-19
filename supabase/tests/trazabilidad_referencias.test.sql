-- Pruebas de la trazabilidad de referencias (issue #46, S17): confianza y evidencia en
-- `referencia`, y la tabla `referencia_rechazada` (solo lectura para el administrador).
-- Se ejecutan con `npm run test:db` (supabase test db) sobre Supabase local.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- ---------------------------------------------------------------------------
-- Datos de prueba (como postgres, sin RLS); el rollback final restaura la base.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d6', 'decisor6@prueba.ec'),
  ('00000000-0000-0000-0000-0000000000a6', 'admin6@prueba.ec');
update public.perfil set rol = 'administrador' where id = '00000000-0000-0000-0000-0000000000a6';

insert into public.dimension (nombre) values ('Trazabilidad');
insert into public.factor (id_dimension, nombre, alcance, orden)
  values ((select max(id_dimension) from public.dimension), 'Factor de trazabilidad', 'Externo', 99);
insert into public.subfactor (id_factor, enunciado, orden)
  values ((select max(id_factor) from public.factor), 'Subfactor de trazabilidad', 1);
insert into public.calculo_sugerida (origen, anio_inicio, anio_fin, estado)
  values ('ia', 2020, 2025, 'en_proceso');

create temporary table ctx (clave text primary key, valor int);
grant all on ctx to authenticated, anon, service_role;
insert into ctx values
  ('calculo', (select max(id_calculo) from public.calculo_sugerida where origen = 'ia')),
  ('subfactor', (select max(id_subfactor) from public.subfactor));

-- Una referencia anterior a la migración (sin confianza ni evidencia) y un rechazado.
insert into public.referencia (id_calculo, id_subfactor, titulo, anio, doi)
  values ((select valor from ctx where clave = 'calculo'),
          (select valor from ctx where clave = 'subfactor'), 'Artículo previo', 2021, '10.1/previo');
insert into public.referencia_rechazada
  (id_calculo, id_subfactor, titulo, anio, doi, base_datos, confianza, evidencia)
  values ((select valor from ctx where clave = 'calculo'),
          (select valor from ctx where clave = 'subfactor'),
          'Artículo rechazado', 2022, '10.1/rechazado', 'openalex', 0.35, 'No trata el subfactor.');

-- ---------------------------------------------------------------------------
-- Estructura de referencia
-- ---------------------------------------------------------------------------
select has_column('public', 'referencia', 'confianza', 'referencia tiene confianza');
select col_type_is('public', 'referencia', 'confianza', 'numeric', 'confianza es numeric');
select col_is_null('public', 'referencia', 'confianza', 'confianza admite nulo');
select has_column('public', 'referencia', 'evidencia', 'referencia tiene evidencia');
select col_type_is('public', 'referencia', 'evidencia', 'character varying(500)',
  'evidencia es varchar(500)');
select col_is_null('public', 'referencia', 'evidencia', 'evidencia admite nulo');
select is(
  (select confianza is null and evidencia is null from public.referencia
   where doi = '10.1/previo'),
  true, 'las referencias existentes quedan con confianza y evidencia nulas (migración aditiva)');

-- ---------------------------------------------------------------------------
-- Estructura de referencia_rechazada
-- ---------------------------------------------------------------------------
select has_table('public', 'referencia_rechazada', 'existe referencia_rechazada');
select col_type_is('public', 'referencia_rechazada', 'id_referencia_rechazada', 'integer',
  'id_referencia_rechazada es integer');
select col_type_is('public', 'referencia_rechazada', 'id_calculo', 'integer', 'id_calculo es integer');
select col_type_is('public', 'referencia_rechazada', 'id_subfactor', 'integer',
  'id_subfactor es integer');
select col_type_is('public', 'referencia_rechazada', 'titulo', 'character varying(500)',
  'titulo es varchar(500)');
select col_type_is('public', 'referencia_rechazada', 'anio', 'smallint', 'anio es smallint');
select col_type_is('public', 'referencia_rechazada', 'doi', 'character varying(200)',
  'doi es varchar(200)');
select col_type_is('public', 'referencia_rechazada', 'base_datos', 'character varying(40)',
  'base_datos es varchar(40)');
select col_type_is('public', 'referencia_rechazada', 'confianza', 'numeric', 'confianza es numeric');
select col_type_is('public', 'referencia_rechazada', 'evidencia', 'character varying(500)',
  'evidencia es varchar(500)');
select col_is_pk('public', 'referencia_rechazada', 'id_referencia_rechazada',
  'la clave primaria es id_referencia_rechazada');
select is(
  (select relrowsecurity from pg_class where oid = 'public.referencia_rechazada'::regclass),
  true, 'referencia_rechazada tiene RLS activa');

-- ---------------------------------------------------------------------------
-- Restricciones (como service_role: es quien escribe)
-- ---------------------------------------------------------------------------
set local role service_role;
select lives_ok(
  $$ update public.referencia set confianza = 0.9, evidencia = 'Trata el subfactor.'
     where doi = '10.1/previo' $$,
  'service_role escribe confianza y evidencia en referencia');
select throws_ok(
  $$ update public.referencia set confianza = 1.01 where doi = '10.1/previo' $$,
  '23514', null, 'referencia.confianza no admite valores mayores que 1');
select throws_ok(
  $$ update public.referencia set confianza = -0.01 where doi = '10.1/previo' $$,
  '23514', null, 'referencia.confianza no admite valores negativos');
select throws_ok(
  $$ insert into public.referencia_rechazada
       (id_calculo, id_subfactor, titulo, anio, doi, confianza)
     values ((select valor from ctx where clave = 'calculo'),
             (select valor from ctx where clave = 'subfactor'), 'Otro', 2022, '10.1/otro', 1.5) $$,
  '23514', null, 'referencia_rechazada.confianza no admite valores mayores que 1');
select lives_ok(
  $$ insert into public.referencia_rechazada
       (id_calculo, id_subfactor, titulo, anio, doi, confianza)
     values ((select valor from ctx where clave = 'calculo'),
             (select valor from ctx where clave = 'subfactor'), 'Sin evidencia', 2023,
             '10.1/sin-evidencia', null) $$,
  'confianza y evidencia admiten nulo en un rechazado');
select throws_ok(
  $$ insert into public.referencia_rechazada (id_calculo, id_subfactor, titulo, anio, doi)
     values ((select valor from ctx where clave = 'calculo'),
             (select valor from ctx where clave = 'subfactor'), 'Repetido', 2022, '10.1/rechazado') $$,
  '23505', null, 'no se repite el DOI de un rechazado dentro del mismo cálculo y subfactor');
reset role;

-- ---------------------------------------------------------------------------
-- Lectura: el administrador sí; el decisor y el anónimo no
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';
select is(
  (select count(*)::int from public.referencia_rechazada), 2,
  'el administrador lee los rechazados');
select is(
  (select evidencia from public.referencia_rechazada where doi = '10.1/rechazado'),
  'No trata el subfactor.', 'el administrador lee la evidencia de un rechazado');
select is(
  (select confianza from public.referencia where doi = '10.1/previo'),
  0.9, 'el administrador lee la confianza de una referencia aceptada');

-- El administrador tampoco escribe desde el cliente.
select throws_ok(
  $$ insert into public.referencia_rechazada (id_calculo, id_subfactor, titulo, anio, doi)
     values ((select valor from ctx where clave = 'calculo'),
             (select valor from ctx where clave = 'subfactor'), 'Intruso', 2022, '10.1/intruso') $$,
  '42501', null, 'un administrador autenticado no inserta rechazados');
select throws_ok(
  $$ update public.referencia_rechazada set evidencia = 'cambiada' $$,
  '42501', null, 'un administrador autenticado no modifica rechazados');
select throws_ok(
  $$ delete from public.referencia_rechazada $$,
  '42501', null, 'un administrador autenticado no borra rechazados');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d6","role":"authenticated"}';
select is(
  (select count(*)::int from public.referencia_rechazada), 0,
  'un decisor no ve ningún rechazado');
select throws_ok(
  $$ insert into public.referencia_rechazada (id_calculo, id_subfactor, titulo, anio, doi)
     values ((select valor from ctx where clave = 'calculo'),
             (select valor from ctx where clave = 'subfactor'), 'Intruso', 2022, '10.1/intruso') $$,
  '42501', null, 'un decisor no inserta rechazados');
reset role;

set local role anon;
select is(
  (select count(*)::int from public.referencia_rechazada), 0,
  'un anónimo no ve ningún rechazado');
reset role;

-- ---------------------------------------------------------------------------
-- Cascada: al borrar el cálculo se van sus rechazados
-- ---------------------------------------------------------------------------
delete from public.calculo_sugerida where id_calculo = (select valor from ctx where clave = 'calculo');
select is(
  (select count(*)::int from public.referencia_rechazada
   where id_calculo = (select valor from ctx where clave = 'calculo')),
  0, 'al borrar el cálculo se borran sus rechazados en cascada');

select * from finish();
rollback;
