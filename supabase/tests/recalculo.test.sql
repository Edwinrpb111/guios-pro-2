-- Pruebas del ciclo de vida de un recálculo de IS (issue #11, BRIEF §11.2, §13.2, §13.5):
-- creación atómica del cálculo y sus pasos, pausa, guardado con c_i por subfactor,
-- publicación con un único vigente e histórico, y descarte.
-- Se ejecutan con `npm run test:db` (supabase test db) sobre Supabase local.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- ---------------------------------------------------------------------------
-- Datos de prueba (como postgres, sin RLS); el rollback final restaura la base.
-- ---------------------------------------------------------------------------
truncate public.sugerida_factor, public.calculo_sugerida, public.subfactor, public.factor,
  public.dimension cascade;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'decisor@prueba.ec'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@prueba.ec');
update public.perfil set rol = 'administrador' where id = '00000000-0000-0000-0000-0000000000a1';

create temporary table ctx (clave text primary key, valor int);
create temporary table filas (clave text primary key, valor jsonb);
grant all on ctx, filas to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Creación atómica (seguimiento L19): sin catálogo no queda ningún cálculo huérfano.
-- ---------------------------------------------------------------------------
select has_function('public', 'crear_calculo_con_pasos',
  array['integer', 'integer', 'text', 'jsonb', 'uuid'],
  'existe crear_calculo_con_pasos(anio_inicio, anio_fin, bases, parametros, creado_por)');

set local role service_role;
select throws_ok(
  $$ select public.crear_calculo_con_pasos(2020, 2025, 'OpenAlex', '{}'::jsonb,
       '00000000-0000-0000-0000-0000000000a1') $$,
  'P0001', null, 'con el catálogo vacío crear_calculo_con_pasos falla');
select is((select count(*)::int from public.calculo_sugerida), 0,
  'si no se pueden crear los pasos no queda ningún cálculo (atómico)');
reset role;

insert into public.dimension (nombre) values ('Prueba');
insert into public.factor (id_dimension, nombre, alcance, orden)
  select (select id_dimension from public.dimension), 'Factor ' || n, 'Externo', n
  from generate_series(1, 18) as n;
-- El factor 1 tiene dos subfactores; el resto, uno (61 no hace falta para la prueba).
insert into public.subfactor (id_factor, enunciado, orden)
  select id_factor, 'Subfactor de ' || nombre, 1 from public.factor;
insert into public.subfactor (id_factor, enunciado, orden)
  select id_factor, 'Segundo subfactor', 2 from public.factor where orden = 1;
insert into public.calculo_sugerida (origen, etiqueta_rango, bases_datos, estado, vigente)
  values ('tesis', 'RSL de la tesis', 'IEEE, ACM, Scopus, WoS', 'publicado', true);
insert into ctx values ('tesis', (select id_calculo from public.calculo_sugerida));

set local role service_role;
select throws_ok(
  $$ select public.crear_calculo_con_pasos(2025, 2020, 'OpenAlex', '{}'::jsonb,
       '00000000-0000-0000-0000-0000000000a1') $$,
  '23514', null, 'un rango de años invertido no crea el cálculo');
select is((select count(*)::int from public.calculo_sugerida where origen = 'ia'), 0,
  'el rango inválido no deja cálculo ni pasos');

insert into ctx values ('a', public.crear_calculo_con_pasos(2020, 2025, 'OpenAlex, Crossref',
  '{"fuentes":["openalex","crossref"],"umbral":0.7}'::jsonb, '00000000-0000-0000-0000-0000000000a1'));
reset role;

select results_eq(
  $$ select origen::text, estado::text, progreso::int, anio_inicio::int, anio_fin::int, bases_datos::text,
            creado_por, parametros
     from public.calculo_sugerida where id_calculo = (select valor from ctx where clave = 'a') $$,
  $$ values ('ia', 'en_proceso', 0, 2020, 2025, 'OpenAlex, Crossref',
            '00000000-0000-0000-0000-0000000000a1'::uuid,
            '{"fuentes":["openalex","crossref"],"umbral":0.7}'::jsonb) $$,
  'el cálculo nuevo queda en_proceso, de origen ia y con sus parámetros (RNF-09)');
select is(
  (select count(*)::int from public.recalculo_paso
   where id_calculo = (select valor from ctx where clave = 'a') and estado = 'pendiente'),
  (select count(*)::int from public.subfactor),
  'se crea un paso pendiente por cada subfactor del catálogo');

-- Solo las Edge Functions (service_role) crean cálculos: nadie más ejecuta la función.
set local role anon;
select throws_ok(
  $$ select public.crear_calculo_con_pasos(2020, 2025, 'x', '{}'::jsonb, null) $$,
  '42501', null, 'anónimo no ejecuta crear_calculo_con_pasos');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok(
  $$ select public.crear_calculo_con_pasos(2020, 2025, 'x', '{}'::jsonb, null) $$,
  '42501', null, 'ni siquiera un administrador la ejecuta desde el cliente');
reset role;

-- ---------------------------------------------------------------------------
-- Pausa manual (BRIEF §13.5): el administrador detiene el recálculo desde P-09.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select throws_ok($$ select public.pausar_calculo((select valor from ctx where clave = 'a')) $$,
  '42501', null, 'un decisor no pausa un cálculo');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok($$ select public.pausar_calculo((select valor from ctx where clave = 'a')) $$,
  'un administrador pausa un cálculo en proceso');
select results_eq(
  $$ select estado::text, mensaje_error is not null from public.calculo_sugerida
     where id_calculo = (select valor from ctx where clave = 'a') $$,
  $$ values ('pausado', true) $$, 'el cálculo queda pausado con un mensaje legible');
select throws_ok($$ select public.pausar_calculo((select valor from ctx where clave = 'a')) $$,
  'P0001', null, 'no se pausa un cálculo que no está en proceso');
select throws_ok($$ select public.pausar_calculo((select valor from ctx where clave = 'tesis')) $$,
  'P0001', null, 'no se pausa un cálculo publicado');
select throws_ok($$ select public.pausar_calculo(-1) $$,
  'P0001', null, 'pausar un cálculo inexistente falla con mensaje');
reset role;

-- ---------------------------------------------------------------------------
-- Guardado del resultado: c_i y n_i deben coincidir con conteo_citas (trampa 6).
-- ---------------------------------------------------------------------------
update public.recalculo_paso set estado = 'hecho'
  where id_calculo = (select valor from ctx where clave = 'a');
-- Dos artículos del mismo subfactor y uno del segundo subfactor del factor 1: c_1 = 3.
insert into public.referencia (id_calculo, id_subfactor, titulo, anio, doi)
  select (select valor from ctx where clave = 'a'), s.id_subfactor, 'Artículo ' || d, 2022, d
  from public.subfactor s
  join public.factor f on f.id_factor = s.id_factor and f.orden = 1 and s.orden = 1
  cross join (values ('10.1/a'), ('10.1/b')) as v (d);
insert into public.referencia (id_calculo, id_subfactor, titulo, anio, doi)
  select (select valor from ctx where clave = 'a'), s.id_subfactor, 'Artículo c', 2023, '10.1/a'
  from public.subfactor s
  join public.factor f on f.id_factor = s.id_factor and f.orden = 1 and s.orden = 2;

-- Filas correctas: n_i y c_i del catálogo y de las referencias; IL/IS de ejemplo.
insert into filas
  select 'ok', jsonb_agg(jsonb_build_object(
    'id_factor', f.id_factor,
    'num_subfactores', (select count(*) from public.subfactor s where s.id_factor = f.id_factor),
    'total_citas', case when f.orden = 1 then 3 else 0 end,
    'razon_citas', case when f.orden = 1 then 1.5 else 0 end,
    'importancia_experto', 3,
    'importancia_literatura', case when f.orden = 1 then 4 else 1 end,
    'importancia_sugerida', case when f.orden = 1 then 3 else 2 end))
  from public.factor f;
insert into filas
  select 'citas_mal', jsonb_agg(case when (e ->> 'total_citas')::int = 3
    then jsonb_set(e, '{total_citas}', '2') else e end)
  from jsonb_array_elements((select valor from filas where clave = 'ok')) e;
insert into filas
  select 'subfactores_mal', jsonb_agg(case when (e ->> 'total_citas')::int = 3
    then jsonb_set(e, '{num_subfactores}', '1') else e end)
  from jsonb_array_elements((select valor from filas where clave = 'ok')) e;
insert into filas
  select 'experto_mal', jsonb_agg(jsonb_set(e, '{importancia_experto}', '4'))
  from jsonb_array_elements((select valor from filas where clave = 'ok')) e;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select results_eq(
  $$ select total_citas from public.conteo_citas((select valor from ctx where clave = 'a')) limit 1 $$,
  $$ values (3) $$, 'conteo_citas suma las citas de cada subfactor del factor (c_i por subfactor)');
select throws_ok(
  $$ select public.guardar_resultado_calculo((select valor from ctx where clave = 'a'),
       (select valor from filas where clave = 'citas_mal')) $$,
  'P0001', null, 'guardar_resultado_calculo rechaza un total de citas distinto de conteo_citas');
select throws_ok(
  $$ select public.guardar_resultado_calculo((select valor from ctx where clave = 'a'),
       (select valor from filas where clave = 'subfactores_mal')) $$,
  'P0001', null, 'guardar_resultado_calculo rechaza un número de subfactores distinto del catálogo');
select throws_ok(
  $$ select public.guardar_resultado_calculo((select valor from ctx where clave = 'a'),
       (select valor from filas where clave = 'experto_mal')) $$,
  'P0001', null, 'guardar_resultado_calculo rechaza una IE distinta de la del factor');
select is((select count(*)::int from public.sugerida_factor
           where id_calculo = (select valor from ctx where clave = 'a')), 0,
  'un guardado rechazado no deja filas a medias');
select lives_ok(
  $$ select public.guardar_resultado_calculo((select valor from ctx where clave = 'a'),
       (select valor from filas where clave = 'ok')) $$,
  'un cálculo pausado con todos sus pasos hechos guarda sus 18 filas');
select results_eq(
  $$ select estado::text, progreso::int, mensaje_error from public.calculo_sugerida
     where id_calculo = (select valor from ctx where clave = 'a') $$,
  $$ values ('completado', 18, null::text) $$, 'el cálculo queda completado, con progreso 18');
select throws_ok($$ select public.pausar_calculo((select valor from ctx where clave = 'a')) $$,
  'P0001', null, 'no se pausa un cálculo completado');
reset role;

-- ---------------------------------------------------------------------------
-- Publicar: exactamente un vigente y se conserva el histórico.
-- ---------------------------------------------------------------------------
-- Una evaluación hecha con el cálculo de la tesis (fotografía, trampa 9).
insert into public.evaluacion (id_usuario, id_calculo)
  values ('00000000-0000-0000-0000-0000000000d1', (select valor from ctx where clave = 'tesis'));

-- Un segundo recálculo completo (b) y uno a medias (c).
set local role service_role;
insert into ctx values ('b', public.crear_calculo_con_pasos(2021, 2025, 'OpenAlex', '{}'::jsonb, null));
insert into ctx values ('c', public.crear_calculo_con_pasos(2022, 2025, 'Crossref', '{}'::jsonb, null));
reset role;
update public.recalculo_paso set estado = 'hecho'
  where id_calculo = (select valor from ctx where clave = 'b');
insert into filas
  select 'ok_b', jsonb_agg(case when (e ->> 'total_citas')::int = 3
    then e || '{"total_citas": 0, "razon_citas": 0, "importancia_literatura": 1, "importancia_sugerida": 2}'
    else e end)
  from jsonb_array_elements((select valor from filas where clave = 'ok')) e;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select throws_ok($$ select public.publicar_calculo((select valor from ctx where clave = 'a')) $$,
  '42501', null, 'un decisor no publica');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok($$ select public.publicar_calculo((select valor from ctx where clave = 'c')) $$,
  'P0001', null, 'no se publica un cálculo a medias (el vigente no cambia)');
select lives_ok($$ select public.publicar_calculo((select valor from ctx where clave = 'a')) $$,
  'se publica el cálculo completado a');
select lives_ok(
  $$ select public.guardar_resultado_calculo((select valor from ctx where clave = 'b'),
       (select valor from filas where clave = 'ok_b')) $$,
  'se guarda el resultado del cálculo b');
select lives_ok($$ select public.publicar_calculo((select valor from ctx where clave = 'b')) $$,
  'se publica el cálculo b');
select results_eq(
  $$ select id_calculo from public.calculo_sugerida where vigente $$,
  $$ select valor from ctx where clave = 'b' $$,
  'después de publicar hay exactamente un cálculo vigente: el último publicado');
select results_eq(
  $$ select id_calculo, estado::text from public.calculo_sugerida
     where id_calculo in (select valor from ctx where clave in ('tesis', 'a')) order by id_calculo $$,
  $$ select valor, 'publicado' from ctx where clave in ('tesis', 'a') order by valor $$,
  'los cálculos publicados antes se conservan como histórico (publicado, no vigente)');
select is((select count(*)::int from public.sugerida_factor
           where id_calculo = (select valor from ctx where clave = 'a')), 18,
  'el histórico conserva sus 18 filas de IS');
select throws_ok($$ select public.publicar_calculo((select valor from ctx where clave = 'b')) $$,
  'P0001', null, 'no se publica dos veces el mismo cálculo');

-- ---------------------------------------------------------------------------
-- Descartar: solo lo que no se publicó.
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.descartar_calculo((select valor from ctx where clave = 'a')) $$,
  'P0001', null, 'no se descarta un cálculo publicado del histórico');
select lives_ok($$ select public.descartar_calculo((select valor from ctx where clave = 'c')) $$,
  'se descarta un cálculo en proceso');
select is((select estado::text from public.calculo_sugerida
           where id_calculo = (select valor from ctx where clave = 'c')), 'descartado',
  'el cálculo descartado queda registrado como descartado');
reset role;

select * from finish();
rollback;
