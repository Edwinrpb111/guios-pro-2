-- Pruebas de seguridad por fila y funciones RPC (BRIEF §10.3, §11.2, §15.3).
-- Se ejecutan con `npm run test:db` (supabase test db) sobre Supabase local.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- ---------------------------------------------------------------------------
-- Datos de prueba (como postgres, sin RLS)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@prueba.ec', '{"nombre_completo":"Ana Decisora"}'),
  ('00000000-0000-0000-0000-00000000000b', 'beto@prueba.ec', '{}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@prueba.ec', '{}');

select is(
  (select rol from public.perfil where id = '00000000-0000-0000-0000-00000000000a'),
  'decisor', 'el trigger crea el perfil con rol decisor');
select is(
  (select nombre_completo from public.perfil where id = '00000000-0000-0000-0000-00000000000a'),
  'Ana Decisora', 'el perfil toma el nombre de los metadatos del registro');
select is(
  (select nombre_completo from public.perfil where id = '00000000-0000-0000-0000-00000000000b'),
  'beto@prueba.ec', 'sin nombre en los metadatos, el perfil usa el correo');

update public.perfil set rol = 'administrador' where id = '00000000-0000-0000-0000-0000000000ad';

insert into public.dimension (nombre) values ('Prueba');
insert into public.factor (id_dimension, nombre, alcance, orden)
  select (select id_dimension from public.dimension), 'Factor ' || n, 'Externo', n
  from generate_series(1, 18) as n;
insert into public.subfactor (id_factor, enunciado, orden)
  select id_factor, 'Subfactor de ' || nombre, 1 from public.factor;

insert into public.calculo_sugerida (origen, etiqueta_rango, bases_datos, estado, vigente)
  values ('tesis', 'RSL de la tesis', 'IEEE, ACM, Scopus, WoS', 'publicado', true);
insert into public.calculo_sugerida (origen, anio_inicio, anio_fin, estado)
  values ('ia', 2020, 2025, 'en_proceso');
insert into public.recalculo_paso (id_calculo, id_subfactor, estado)
  select (select id_calculo from public.calculo_sugerida where origen = 'ia'), id_subfactor, 'pendiente'
  from public.subfactor;
insert into public.referencia (id_calculo, id_subfactor, titulo, anio, doi)
  values ((select id_calculo from public.calculo_sugerida where origen = 'ia'),
          (select min(id_subfactor) from public.subfactor), 'Artículo', 2021, '10.1/x');

create temporary table ctx (clave text primary key, valor int);
grant all on ctx to authenticated, anon;
insert into ctx values
  ('tesis', (select id_calculo from public.calculo_sugerida where origen = 'tesis')),
  ('ia', (select id_calculo from public.calculo_sugerida where origen = 'ia')),
  ('factor', (select min(id_factor) from public.factor));

-- ---------------------------------------------------------------------------
-- Anónimo
-- ---------------------------------------------------------------------------
set local role anon;
select is((select count(*)::int from public.factor), 0, 'anónimo no lee el catálogo');
select is((select count(*)::int from public.calculo_sugerida), 0, 'anónimo no lee los cálculos');
reset role;

-- ---------------------------------------------------------------------------
-- Decisora Ana
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select is(public.es_admin(), false, 'es_admin() es falso para un decisor');
select is((select count(*)::int from public.factor), 18, 'un autenticado lee el catálogo');
select is((select count(*)::int from public.calculo_sugerida), 2, 'un autenticado lee los cálculos');
select is((select count(*)::int from public.referencia), 0, 'un decisor no lee referencias');
select is((select count(*)::int from public.recalculo_paso), 0, 'un decisor no lee pasos del recálculo');

select throws_ok($$ insert into public.dimension (nombre) values ('Otra') $$, '42501', null,
  'un decisor no escribe el catálogo');
select throws_ok($$ insert into public.calculo_sugerida (origen) values ('tesis') $$, '42501', null,
  'un decisor no crea cálculos directamente');
select results_eq(
  $$ with u as (update public.calculo_sugerida set vigente = false where vigente returning 1)
     select count(*)::int from u $$,
  $$ values (0) $$, 'un decisor no modifica cálculos directamente');

select throws_ok($$ select public.publicar_calculo((select valor from ctx where clave = 'ia')) $$,
  '42501', null, 'un decisor no publica cálculos');
select throws_ok($$ select public.descartar_calculo((select valor from ctx where clave = 'ia')) $$,
  '42501', null, 'un decisor no descarta cálculos');
select throws_ok($$ select * from public.conteo_citas((select valor from ctx where clave = 'ia')) $$,
  '42501', null, 'un decisor no consulta el conteo de citas');

-- Perfil
select is((select count(*)::int from public.perfil), 1, 'un usuario solo lee su propio perfil');
select throws_ok(
  $$ update public.perfil set rol = 'administrador' where id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501', null, 'un usuario no puede cambiar su rol');
select results_eq(
  $$ with u as (update public.perfil set nombre_completo = 'Ana M.' returning 1) select count(*)::int from u $$,
  $$ values (1) $$, 'un usuario edita su nombre');

-- Organización, software y evaluación propios
insert into public.organizacion (nombre) values ('UNEMI');
insert into public.software_evaluado (nombre) values ('LibreOffice');
insert into public.evaluacion (id_calculo, titulo, id_software)
  values ((select valor from ctx where clave = 'tesis'), 'Adopción de LibreOffice',
          (select id_software from public.software_evaluado));
insert into public.valoracion_factor (id_evaluacion, id_factor, importancia_decisor)
  values ((select id_evaluacion from public.evaluacion), (select valor from ctx where clave = 'factor'), 4);
insert into public.valoracion_subfactor (id_val_factor, id_subfactor, nivel_cumplimiento)
  values ((select id_val_factor from public.valoracion_factor),
          (select id_subfactor from public.subfactor
            where id_factor = (select valor from ctx where clave = 'factor')), 3);

select is((select id_usuario from public.evaluacion), '00000000-0000-0000-0000-00000000000a'::uuid,
  'la evaluación queda a nombre de quien la crea');
select throws_ok(
  $$ insert into public.evaluacion (id_usuario, id_calculo)
     values ('00000000-0000-0000-0000-00000000000b', (select valor from ctx where clave = 'tesis')) $$,
  '42501', null, 'no se crea una evaluación a nombre de otro');

-- Finalizar bloquea la evaluación y sus valoraciones
select results_eq(
  $$ with u as (update public.evaluacion
                set estado = 'finalizada', codigo_recomendacion = 'C',
                    causas = '[{"factor":"Factor 1","foda":"Amenaza","ir":3}]'
                returning 1) select count(*)::int from u $$,
  $$ values (1) $$, 'el dueño finaliza su evaluación');
select results_eq(
  $$ with u as (update public.evaluacion set titulo = 'Cambiado' returning 1) select count(*)::int from u $$,
  $$ values (0) $$, 'una evaluación finalizada no se modifica');
select results_eq(
  $$ with u as (delete from public.evaluacion returning 1) select count(*)::int from u $$,
  $$ values (0) $$, 'una evaluación finalizada no se borra');
select results_eq(
  $$ with u as (update public.valoracion_factor set importancia_decisor = 1 returning 1) select count(*)::int from u $$,
  $$ values (0) $$, 'las valoraciones de una evaluación finalizada no se modifican');
select results_eq(
  $$ with u as (update public.valoracion_subfactor set nivel_cumplimiento = 1 returning 1) select count(*)::int from u $$,
  $$ values (0) $$, 'los PS de una evaluación finalizada no se modifican');
select throws_ok(
  $$ insert into public.valoracion_factor (id_evaluacion, id_factor)
     values ((select id_evaluacion from public.evaluacion), (select max(id_factor) from public.factor)) $$,
  '42501', null, 'no se agregan valoraciones a una evaluación finalizada');
reset role;

-- ---------------------------------------------------------------------------
-- Decisor Beto: no ve nada de Ana (BRIEF §15.3)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

select is((select count(*)::int from public.evaluacion), 0, 'un usuario no lee la evaluación de otro');
select is((select count(*)::int from public.valoracion_factor), 0, 'un usuario no lee valoraciones de otro');
select is((select count(*)::int from public.valoracion_subfactor), 0, 'un usuario no lee PS de otro');
select is((select count(*)::int from public.organizacion), 0, 'un usuario no lee organizaciones de otro');
select is((select count(*)::int from public.software_evaluado), 0, 'un usuario no lee software de otro');
select is((select count(*)::int from public.perfil where id = '00000000-0000-0000-0000-00000000000a'), 0,
  'un usuario no lee el perfil de otro');
reset role;

-- ---------------------------------------------------------------------------
-- Administrador: funciones de §11.2
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}';

select is(public.es_admin(), true, 'es_admin() es verdadero para un administrador');
select is((select count(*)::int from public.referencia), 1, 'un administrador lee referencias');
select results_eq(
  $$ select num_subfactores, total_citas from public.conteo_citas((select valor from ctx where clave = 'ia'))
     order by total_citas desc limit 1 $$,
  $$ values (1, 1) $$, 'conteo_citas cuenta subfactores y referencias por factor');

select throws_ok(
  $$ select public.guardar_resultado_calculo((select valor from ctx where clave = 'ia'),
       (select jsonb_agg(jsonb_build_object('id_factor', id_factor, 'num_subfactores', 1, 'total_citas', 0,
          'razon_citas', 0, 'importancia_experto', 3, 'importancia_literatura', 1, 'importancia_sugerida', 2))
        from public.factor)) $$,
  'P0001', null, 'guardar_resultado_calculo falla si quedan pasos pendientes');
reset role;
update public.recalculo_paso set estado = 'hecho';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}';

select throws_ok(
  $$ select public.guardar_resultado_calculo((select valor from ctx where clave = 'ia'),
       (select jsonb_agg(jsonb_build_object('id_factor', id_factor, 'num_subfactores', 1, 'total_citas', 0,
          'razon_citas', 0, 'importancia_experto', 3, 'importancia_literatura', 1, 'importancia_sugerida', 2))
        from (select id_factor from public.factor order by id_factor limit 17) f)) $$,
  'P0001', null, 'guardar_resultado_calculo exige exactamente 18 filas');
select lives_ok(
  $$ select public.guardar_resultado_calculo((select valor from ctx where clave = 'ia'),
       (select jsonb_agg(jsonb_build_object('id_factor', id_factor, 'num_subfactores', 1, 'total_citas', 0,
          'razon_citas', 0, 'importancia_experto', 3, 'importancia_literatura', 1, 'importancia_sugerida', 2))
        from public.factor)) $$,
  'guardar_resultado_calculo guarda las 18 filas');
select is((select estado from public.calculo_sugerida where id_calculo = (select valor from ctx where clave = 'ia')),
  'completado', 'el cálculo queda completado');

select throws_ok($$ select public.descartar_calculo((select valor from ctx where clave = 'tesis')) $$,
  'P0001', null, 'no se descarta el cálculo vigente');
select lives_ok($$ select public.publicar_calculo((select valor from ctx where clave = 'ia')) $$,
  'un administrador publica un cálculo completado');
select results_eq(
  $$ select id_calculo, estado, vigente from public.calculo_sugerida order by id_calculo $$,
  $$ select (select valor from ctx where clave = 'tesis'), 'publicado'::varchar, false
     union all select (select valor from ctx where clave = 'ia'), 'publicado'::varchar, true $$,
  'publicar desmarca el vigente anterior y deja uno solo vigente');
reset role;

select * from finish();
rollback;
