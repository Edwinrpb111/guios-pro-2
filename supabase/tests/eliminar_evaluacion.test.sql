-- Eliminar evaluaciones desde el historial (issue #32, BRIEF §10.3).
-- Solo el dueño borra sus evaluaciones en curso; el borrado arrastra sus valoraciones
-- (ON DELETE CASCADE) y nada más: ni el catálogo, ni los cálculos de IS, ni el software.
-- Se ejecutan con `npm run test:db` sobre Supabase local con la semilla aplicada.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- ---------------------------------------------------------------------------
-- Datos de prueba (como postgres, sin RLS). El rollback final los descarta.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000032aa', 'ana32@prueba.ec', '{"nombre_completo":"Ana"}'),
  ('00000000-0000-0000-0000-0000000032bb', 'beto32@prueba.ec', '{"nombre_completo":"Beto"}');

create temporary table ctx (clave text primary key, valor int);
grant all on ctx to authenticated, anon;

insert into public.software_evaluado (nombre, creado_por)
  values ('LibreOffice', '00000000-0000-0000-0000-0000000032aa');
insert into ctx values
  ('vigente', (select id_calculo from public.calculo_sugerida where vigente)),
  ('factor', (select min(id_factor) from public.factor)),
  ('software', (select id_software from public.software_evaluado
                where creado_por = '00000000-0000-0000-0000-0000000032aa')),
  ('dimensiones', (select count(*) from public.dimension)),
  ('factores', (select count(*) from public.factor)),
  ('subfactores', (select count(*) from public.subfactor)),
  ('calculos', (select count(*) from public.calculo_sugerida)),
  ('sugeridas', (select count(*) from public.sugerida_factor));

-- Ana: un borrador con valoraciones y una finalizada con valoraciones; Beto: un borrador.
insert into public.evaluacion (id_usuario, id_calculo, titulo, id_software)
  values ('00000000-0000-0000-0000-0000000032aa', (select valor from ctx where clave = 'vigente'),
          'Borrador de Ana', (select valor from ctx where clave = 'software'));
insert into public.evaluacion (id_usuario, id_calculo, titulo)
  values ('00000000-0000-0000-0000-0000000032aa', (select valor from ctx where clave = 'vigente'),
          'Finalizada de Ana');
insert into public.evaluacion (id_usuario, id_calculo, titulo)
  values ('00000000-0000-0000-0000-0000000032bb', (select valor from ctx where clave = 'vigente'),
          'Borrador de Beto');
insert into ctx values
  ('borrador_ana', (select id_evaluacion from public.evaluacion where titulo = 'Borrador de Ana')),
  ('finalizada_ana', (select id_evaluacion from public.evaluacion where titulo = 'Finalizada de Ana')),
  ('borrador_beto', (select id_evaluacion from public.evaluacion where titulo = 'Borrador de Beto'));

insert into public.valoracion_factor (id_evaluacion, id_factor, importancia_decisor)
  select valor, (select valor from ctx where clave = 'factor'), 4
  from ctx where clave in ('borrador_ana', 'finalizada_ana');
insert into public.valoracion_subfactor (id_val_factor, id_subfactor, nivel_cumplimiento)
  select vf.id_val_factor, s.id_subfactor, 3
  from public.valoracion_factor vf
  join public.subfactor s on s.id_factor = vf.id_factor
  where vf.id_evaluacion in (select valor from ctx where clave in ('borrador_ana', 'finalizada_ana'));
insert into ctx values
  ('vf_borrador', (select id_val_factor from public.valoracion_factor
                   where id_evaluacion = (select valor from ctx where clave = 'borrador_ana')));
update public.evaluacion set estado = 'finalizada', codigo_recomendacion = 'A'
  where id_evaluacion = (select valor from ctx where clave = 'finalizada_ana');

-- ---------------------------------------------------------------------------
-- Anónimo: no borra nada
-- ---------------------------------------------------------------------------
set local role anon;
select results_eq(
  $$ with u as (delete from public.evaluacion returning 1) select count(*)::int from u $$,
  $$ values (0) $$, 'anónimo no borra evaluaciones');
reset role;

-- ---------------------------------------------------------------------------
-- Beto: no borra lo de Ana
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000032bb","role":"authenticated"}';
select results_eq(
  $$ with u as (delete from public.evaluacion
                where id_evaluacion = (select valor from ctx where clave = 'borrador_ana')
                returning 1) select count(*)::int from u $$,
  $$ values (0) $$, 'un usuario no borra la evaluación en curso de otro');
select results_eq(
  $$ with u as (delete from public.valoracion_factor
                where id_evaluacion = (select valor from ctx where clave = 'borrador_ana')
                returning 1) select count(*)::int from u $$,
  $$ values (0) $$, 'un usuario no borra las valoraciones de otro');
reset role;

-- ---------------------------------------------------------------------------
-- Ana: borra solo su borrador
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000032aa","role":"authenticated"}';
select results_eq(
  $$ with u as (delete from public.evaluacion
                where id_evaluacion = (select valor from ctx where clave = 'borrador_beto')
                returning 1) select count(*)::int from u $$,
  $$ values (0) $$, 'el dueño de otras evaluaciones tampoco borra la de otro');
select results_eq(
  $$ with u as (delete from public.evaluacion
                where id_evaluacion = (select valor from ctx where clave = 'finalizada_ana')
                returning 1) select count(*)::int from u $$,
  $$ values (0) $$, 'el dueño no borra una evaluación finalizada (BRIEF §10.3)');
select results_eq(
  $$ with u as (delete from public.evaluacion
                where id_evaluacion = (select valor from ctx where clave = 'borrador_ana')
                returning 1) select count(*)::int from u $$,
  $$ values (1) $$, 'el dueño borra su evaluación en curso');
select is((select count(*)::int from public.evaluacion), 1,
  'tras borrar, el dueño solo ve su evaluación finalizada');
reset role;

-- ---------------------------------------------------------------------------
-- Efectos: cascada a las valoraciones y nada más
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.valoracion_factor
           where id_evaluacion = (select valor from ctx where clave = 'borrador_ana')), 0,
  'el borrado arrastra las valoraciones de factores');
select is((select count(*)::int from public.valoracion_subfactor
           where id_val_factor = (select valor from ctx where clave = 'vf_borrador')), 0,
  'el borrado arrastra los PS de los subfactores');
select is((select count(*)::int from public.evaluacion
           where id_evaluacion in (select valor from ctx
                                   where clave in ('finalizada_ana', 'borrador_beto'))), 2,
  'las demás evaluaciones siguen');
select is((select count(*)::int from public.valoracion_subfactor vs
           join public.valoracion_factor vf using (id_val_factor)
           where vf.id_evaluacion = (select valor from ctx where clave = 'finalizada_ana')),
  (select count(*)::int from public.subfactor
   where id_factor = (select valor from ctx where clave = 'factor')),
  'la finalizada conserva sus valoraciones');
select is((select count(*)::int from public.software_evaluado
           where id_software = (select valor from ctx where clave = 'software')), 1,
  'el software de la evaluación borrada no se borra');
select is((select count(*)::int from public.perfil
           where id = '00000000-0000-0000-0000-0000000032aa'), 1, 'el perfil del dueño sigue');
select is((select count(*)::int from public.dimension),
  (select valor from ctx where clave = 'dimensiones'), 'el catálogo de dimensiones no cambia');
select is((select count(*)::int from public.factor),
  (select valor from ctx where clave = 'factores'), 'el catálogo de factores no cambia');
select is((select count(*)::int from public.subfactor),
  (select valor from ctx where clave = 'subfactores'), 'el catálogo de subfactores no cambia');
select is((select count(*)::int from public.calculo_sugerida),
  (select valor from ctx where clave = 'calculos'), 'los cálculos de IS no cambian');
select is((select count(*)::int from public.sugerida_factor),
  (select valor from ctx where clave = 'sugeridas'), 'la IS por factor no cambia');

select * from finish();
rollback;
