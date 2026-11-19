-- Pruebas del registro por paso del recálculo (issue #43, S15b): columnas nuevas de
-- recalculo_paso, legibles solo por el administrador y escritas solo por service_role.
-- Se ejecutan con `npm run test:db` (supabase test db) sobre Supabase local.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ---------------------------------------------------------------------------
-- Datos de prueba (como postgres, sin RLS); el rollback final restaura la base.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d4', 'decisor4@prueba.ec'),
  ('00000000-0000-0000-0000-0000000000a4', 'admin4@prueba.ec');
update public.perfil set rol = 'administrador' where id = '00000000-0000-0000-0000-0000000000a4';

insert into public.dimension (nombre) values ('Registro');
insert into public.factor (id_dimension, nombre, alcance, orden)
  values ((select max(id_dimension) from public.dimension), 'Factor de registro', 'Externo', 99);
insert into public.subfactor (id_factor, enunciado, orden)
  values ((select max(id_factor) from public.factor), 'Subfactor de registro', 1);
insert into public.calculo_sugerida (origen, anio_inicio, anio_fin, estado)
  values ('ia', 2020, 2025, 'en_proceso');

create temporary table ctx (clave text primary key, valor int);
grant all on ctx to authenticated, anon, service_role;
insert into ctx values
  ('calculo', (select max(id_calculo) from public.calculo_sugerida where origen = 'ia')),
  ('subfactor', (select max(id_subfactor) from public.subfactor));
insert into public.recalculo_paso (id_calculo, id_subfactor, estado)
  values ((select valor from ctx where clave = 'calculo'),
          (select valor from ctx where clave = 'subfactor'), 'pendiente');

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------
select has_column('public', 'recalculo_paso', 'iniciado_en', 'existe iniciado_en');
select col_type_is('public', 'recalculo_paso', 'iniciado_en', 'timestamp with time zone',
  'iniciado_en es timestamptz');
select col_is_null('public', 'recalculo_paso', 'iniciado_en', 'iniciado_en admite nulo');
select has_column('public', 'recalculo_paso', 'duracion_ms', 'existe duracion_ms');
select col_type_is('public', 'recalculo_paso', 'duracion_ms', 'integer', 'duracion_ms es integer');
select col_is_null('public', 'recalculo_paso', 'duracion_ms', 'duracion_ms admite nulo');
select has_column('public', 'recalculo_paso', 'registro', 'existe registro');
select col_type_is('public', 'recalculo_paso', 'registro', 'jsonb', 'registro es jsonb');
select col_is_null('public', 'recalculo_paso', 'registro', 'registro admite nulo');
select is(
  (select iniciado_en is null and duracion_ms is null and registro is null
   from public.recalculo_paso limit 1),
  true, 'los pasos existentes quedan con las tres columnas nulas (migración aditiva)');

-- ---------------------------------------------------------------------------
-- Escritura: solo service_role (la Edge Function)
-- ---------------------------------------------------------------------------
set local role service_role;
select lives_ok(
  $$ update public.recalculo_paso
     set iniciado_en = now(), duracion_ms = 1234,
         registro = '{"intento":1,"proveedor":"fake","resultado":"hecho","mensaje":null}'::jsonb
     where id_calculo = (select valor from ctx where clave = 'calculo') $$,
  'service_role escribe iniciado_en, duracion_ms y registro');
select throws_ok(
  $$ update public.recalculo_paso set duracion_ms = -1
     where id_calculo = (select valor from ctx where clave = 'calculo') $$,
  '23514', null, 'duracion_ms no admite valores negativos');
reset role;

-- ---------------------------------------------------------------------------
-- Lectura: el administrador sí, el decisor no
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';
select is(
  (select registro ->> 'proveedor' from public.recalculo_paso
   where id_calculo = (select valor from ctx where clave = 'calculo')),
  'fake', 'el administrador lee el registro');
select is(
  (select duracion_ms from public.recalculo_paso
   where id_calculo = (select valor from ctx where clave = 'calculo')),
  1234, 'el administrador lee duracion_ms (y iniciado_en en la misma fila)');

-- El administrador tampoco escribe desde el cliente.
select throws_ok(
  $$ update public.recalculo_paso set registro = '{"intento":99}'::jsonb $$,
  '42501', null, 'un administrador autenticado no puede modificar el registro');
select throws_ok(
  $$ update public.recalculo_paso set iniciado_en = now(), duracion_ms = 1 $$,
  '42501', null, 'un administrador autenticado no puede modificar iniciado_en ni duracion_ms');

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}';
select is(
  (select count(*)::int from public.recalculo_paso), 0,
  'un decisor no ve ninguna fila, así que tampoco el registro');
select throws_ok(
  $$ update public.recalculo_paso set registro = '{"intento":99}'::jsonb $$,
  '42501', null, 'un decisor no puede modificar el registro');
reset role;

select is(
  (select registro ->> 'intento' from public.recalculo_paso
   where id_calculo = (select valor from ctx where clave = 'calculo')),
  '1', 'el registro guardado por la función no cambió tras los intentos del cliente');

select * from finish();
rollback;
