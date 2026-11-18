-- Pruebas de la configuración del recálculo (issue #33): parámetros editables solo por un
-- administrador, claves de solo escritura en Supabase Vault y registro de quién y cuándo.
-- Se ejecutan con `npm run test:db` (supabase test db) sobre Supabase local.
begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

-- ---------------------------------------------------------------------------
-- Datos de prueba (como postgres, sin RLS); el rollback final restaura la base.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d3', 'decisor3@prueba.ec', '{}'),
  ('00000000-0000-0000-0000-0000000000a3', 'admin3@prueba.ec', '{"nombre_completo":"Ada Admin"}');
update public.perfil set rol = 'administrador' where id = '00000000-0000-0000-0000-0000000000a3';

-- ---------------------------------------------------------------------------
-- Estructura
-- ---------------------------------------------------------------------------
select has_table('public', 'configuracion_recalculo', 'existe la tabla configuracion_recalculo');
select has_table('public', 'configuracion_recalculo_cambio', 'existe el registro de cambios');
select is(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.configuracion_recalculo'::regclass,
                 'public.configuracion_recalculo_cambio'::regclass)),
  true, 'RLS activo en las dos tablas de configuración');
select is((select count(*)::int from public.configuracion_recalculo), 1,
  'hay exactamente una fila de configuración');
select results_eq(
  $$ select proveedor_llm, modelo, umbral, max_candidatos, crossref_mailto
     from public.configuracion_recalculo $$,
  $$ values (null::text, null::text, null::numeric, null::integer, null::text) $$,
  'al inicio no hay valores: las Edge Functions usan los secretos de entorno');
select throws_ok(
  $$ insert into public.configuracion_recalculo (id) values (false) $$,
  '23514', null, 'no se puede crear una segunda fila');

-- Dominios cerrados con CHECK (mismas reglas que valida la Edge Function).
select throws_ok($$ update public.configuracion_recalculo set proveedor_llm = 'openai' $$,
  '23514', null, 'proveedor solo gemini o fake');
select throws_ok($$ update public.configuracion_recalculo set umbral = 1.5 $$,
  '23514', null, 'umbral mayor que 1 rechazado');
select throws_ok($$ update public.configuracion_recalculo set umbral = -0.1 $$,
  '23514', null, 'umbral negativo rechazado');
select throws_ok($$ update public.configuracion_recalculo set max_candidatos = 0 $$,
  '23514', null, 'máximo de candidatos menor que 1 rechazado');
select throws_ok($$ update public.configuracion_recalculo set max_candidatos = 201 $$,
  '23514', null, 'máximo de candidatos mayor que 200 rechazado');
select throws_ok($$ update public.configuracion_recalculo set modelo = '   ' $$,
  '23514', null, 'modelo en blanco rechazado');
select throws_ok($$ update public.configuracion_recalculo set crossref_mailto = 'sin-arroba' $$,
  '23514', null, 'correo de Crossref inválido rechazado');

-- ---------------------------------------------------------------------------
-- Anónimo: sin privilegios
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select * from public.configuracion_recalculo $$,
  '42501', null, 'anónimo no lee la configuración');
select throws_ok($$ update public.configuracion_recalculo set umbral = 0.5 $$,
  '42501', null, 'anónimo no cambia la configuración');
select throws_ok($$ select * from public.configuracion_recalculo_cambio $$,
  '42501', null, 'anónimo no lee el registro de cambios');
select throws_ok($$ select * from public.estado_claves_recalculo() $$,
  '42501', null, 'anónimo no consulta el estado de las claves');
select throws_ok($$ select public.guardar_clave_recalculo('GEMINI_API_KEY', 'x') $$,
  '42501', null, 'anónimo no guarda claves');
select throws_ok($$ select public.borrar_clave_recalculo('GEMINI_API_KEY') $$,
  '42501', null, 'anónimo no borra claves');
select throws_ok($$ select * from public.configuracion_recalculo_servicio() $$,
  '42501', null, 'anónimo no lee la configuración con claves');
reset role;

-- ---------------------------------------------------------------------------
-- Decisor: no lee ni cambia nada
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}';
select is_empty($$ select * from public.configuracion_recalculo $$,
  'un decisor no lee la configuración (RLS)');
update public.configuracion_recalculo set umbral = 0.5, proveedor_llm = 'fake';
select throws_ok($$ insert into public.configuracion_recalculo (id) values (true) $$,
  '42501', null, 'un decisor no inserta configuración');
select throws_ok($$ delete from public.configuracion_recalculo $$,
  '42501', null, 'un decisor no borra la configuración');
select throws_ok($$ update public.configuracion_recalculo set actualizado_por = null $$,
  '42501', null, 'un decisor no escribe las columnas de auditoría');
select is_empty($$ select * from public.configuracion_recalculo_cambio $$,
  'un decisor no lee el registro de cambios');
select throws_ok(
  $$ insert into public.configuracion_recalculo_cambio (cambio) values ('falso') $$,
  '42501', null, 'un decisor no escribe en el registro de cambios');
select throws_ok($$ select * from public.estado_claves_recalculo() $$,
  '42501', null, 'un decisor no consulta el estado de las claves');
select throws_ok($$ select public.guardar_clave_recalculo('GEMINI_API_KEY', 'clave-decisor') $$,
  '42501', null, 'un decisor no guarda claves');
select throws_ok($$ select public.borrar_clave_recalculo('GEMINI_API_KEY') $$,
  '42501', null, 'un decisor no borra claves');
select throws_ok($$ select * from public.configuracion_recalculo_servicio() $$,
  '42501', null, 'un decisor no lee la configuración con claves');
select throws_ok($$ select * from vault.decrypted_secrets $$,
  '42501', null, 'un decisor no lee Vault directamente');
reset role;

select results_eq(
  $$ select umbral, proveedor_llm, actualizado_por from public.configuracion_recalculo $$,
  $$ values (null::numeric, null::text, null::uuid) $$,
  'el update del decisor no cambió nada');

-- ---------------------------------------------------------------------------
-- Administrador: lee, cambia y queda registrado quién y cuándo
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select is((select count(*)::int from public.configuracion_recalculo), 1,
  'el administrador lee la configuración');
select lives_ok(
  $$ update public.configuracion_recalculo
     set proveedor_llm = 'gemini', modelo = 'gemini-3.1-flash-lite', umbral = 0.8,
         max_candidatos = 15, crossref_mailto = 'equipo@unemi.edu.ec' $$,
  'el administrador cambia los parámetros');
select throws_ok($$ update public.configuracion_recalculo set actualizado_en = now() - interval '1 day' $$,
  '42501', null, 'ni el administrador escribe las columnas de auditoría a mano');
select results_eq(
  $$ select proveedor_llm, umbral, max_candidatos, actualizado_por, actualizado_en
     from public.configuracion_recalculo $$,
  $$ values ('gemini'::text, 0.8::numeric, 15, '00000000-0000-0000-0000-0000000000a3'::uuid, now()) $$,
  'el cambio guarda quién (auth.uid) y cuándo');
select results_eq(
  $$ select cambio, realizado_por, realizado_por_nombre, realizado_en,
            detalle ->> 'umbral', detalle ->> 'max_candidatos'
     from public.configuracion_recalculo_cambio $$,
  $$ values ('parametros'::text, '00000000-0000-0000-0000-0000000000a3'::uuid, 'Ada Admin'::text, now(),
            '0.8'::text, '15'::text) $$,
  'el registro de cambios anota el cambio de parámetros con su autor');

-- Claves en Vault: solo escritura.
select results_eq(
  $$ select nombre, configurada, actualizada_en from public.estado_claves_recalculo() order by nombre $$,
  $$ values ('GEMINI_API_KEY'::text, false, null::timestamptz),
            ('OPENALEX_API_KEY'::text, false, null::timestamptz) $$,
  'sin claves guardadas el estado dice «no configurada»');
select lives_ok($$ select public.guardar_clave_recalculo('GEMINI_API_KEY', '  clave-secreta-123  ') $$,
  'el administrador guarda la clave de Gemini');
select lives_ok($$ select public.guardar_clave_recalculo('GEMINI_API_KEY', 'clave-secreta-456') $$,
  'el administrador reemplaza la clave de Gemini');
select results_eq(
  $$ select nombre, configurada, actualizada_en is not null
     from public.estado_claves_recalculo() order by nombre $$,
  $$ values ('GEMINI_API_KEY'::text, true, true), ('OPENALEX_API_KEY'::text, false, false) $$,
  'el estado dice «configurada» y cuándo, sin el valor');
select throws_ok($$ select public.guardar_clave_recalculo('LLM_PROVIDER', 'x') $$,
  '22023', null, 'solo se guardan las claves conocidas');
select throws_ok($$ select public.guardar_clave_recalculo('OPENALEX_API_KEY', '   ') $$,
  '22023', null, 'una clave vacía no se guarda');
select throws_ok($$ select * from public.configuracion_recalculo_servicio() $$,
  '42501', null, 'ni el administrador lee las claves descifradas');
select throws_ok($$ select * from vault.decrypted_secrets $$,
  '42501', null, 'el administrador no lee Vault directamente');
select is(
  (select count(*)::int from public.configuracion_recalculo_cambio
   where cambio = 'clave GEMINI_API_KEY guardada'
     and realizado_por = '00000000-0000-0000-0000-0000000000a3'),
  2, 'cada guardado de clave queda registrado con su autor (sin el valor)');
reset role;

-- Ninguna fila del registro ni del estado contiene el valor de la clave.
select is(
  (select count(*)::int from public.configuracion_recalculo_cambio
   where to_jsonb(configuracion_recalculo_cambio)::text like '%clave-secreta%'),
  0, 'el registro de cambios no contiene el valor de la clave');
select isnt(
  (select secret from vault.secrets where name = 'guios_recalculo_gemini_api_key'),
  'clave-secreta-456', 'Vault guarda la clave cifrada');

-- Ninguna función que pueda ejecutar el cliente lee los secretos descifrados.
select is_empty(
  $$ select p.oid::regprocedure::text
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc ilike '%decrypted_secrets%'
       and (has_function_privilege('authenticated', p.oid, 'execute')
            or has_function_privilege('anon', p.oid, 'execute')) $$,
  'ninguna RPC expuesta a anon o authenticated devuelve el valor de una clave');

-- Las Edge Functions (service_role) leen la configuración efectiva con la clave descifrada.
set local role service_role;
select results_eq(
  $$ select proveedor_llm, modelo, umbral, max_candidatos, crossref_mailto,
            gemini_api_key, openalex_api_key
     from public.configuracion_recalculo_servicio() $$,
  $$ values ('gemini'::text, 'gemini-3.1-flash-lite'::text, 0.8::numeric, 15,
            'equipo@unemi.edu.ec'::text, 'clave-secreta-456'::text, null::text) $$,
  'service_role recibe los parámetros y la clave descifrada (sin espacios)');
reset role;

-- Borrar una clave: vuelve a «no configurada» y las funciones usan el secreto de entorno.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select lives_ok($$ select public.borrar_clave_recalculo('GEMINI_API_KEY') $$,
  'el administrador borra la clave de Gemini');
select lives_ok($$ select public.borrar_clave_recalculo('OPENALEX_API_KEY') $$,
  'borrar una clave que no existe no falla');
select results_eq(
  $$ select configurada from public.estado_claves_recalculo() where nombre = 'GEMINI_API_KEY' $$,
  $$ values (false) $$, 'tras borrarla la clave queda «no configurada»');
select is(
  (select count(*)::int from public.configuracion_recalculo_cambio
   where cambio = 'clave GEMINI_API_KEY borrada'),
  1, 'el borrado queda registrado');
reset role;

set local role service_role;
select is((select gemini_api_key from public.configuracion_recalculo_servicio()), null,
  'sin clave guardada service_role no recibe ninguna');
reset role;

select * from finish();
rollback;
