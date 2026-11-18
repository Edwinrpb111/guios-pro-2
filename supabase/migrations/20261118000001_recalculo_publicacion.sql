-- 20261118000001_recalculo_publicacion.sql — ciclo de vida del recálculo de IS (issue #11).
-- * crear_calculo_con_pasos: el cálculo y sus pasos se crean en una sola transacción, así
--   nunca queda un cálculo `en_proceso` sin pasos (seguimiento del issue #10).
-- * pausar_calculo: pausa manual desde P-09 (BRIEF §13.5).
-- * guardar_resultado_calculo: además, c_i y n_i deben coincidir con el conteo (trampa 6).
-- * descartar_calculo: un cálculo publicado forma parte del histórico y no se descarta.
-- Detalle en docs/recalculo.md.

-- ---------------------------------------------------------------------------
-- Creación atómica. Solo la ejecutan las Edge Functions (service_role): el administrador
-- inicia un recálculo con `recalculo-iniciar`, nunca directamente.
-- ---------------------------------------------------------------------------
create function public.crear_calculo_con_pasos(
  p_anio_inicio integer,
  p_anio_fin integer,
  p_bases_datos text,
  p_parametros jsonb,
  p_creado_por uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_id integer;
begin
  if not exists (select 1 from public.subfactor) then
    raise exception 'El catálogo de subfactores está vacío: aplica las migraciones y la semilla.';
  end if;

  insert into public.calculo_sugerida (
    origen, anio_inicio, anio_fin, bases_datos, estado, progreso, parametros, creado_por)
  values ('ia', p_anio_inicio, p_anio_fin, p_bases_datos, 'en_proceso', 0, p_parametros, p_creado_por)
  returning id_calculo into v_id;

  insert into public.recalculo_paso (id_calculo, id_subfactor)
  select v_id, s.id_subfactor from public.subfactor s;

  return v_id;
end;
$$;
revoke execute on function public.crear_calculo_con_pasos(integer, integer, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.crear_calculo_con_pasos(integer, integer, text, jsonb, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Pausa manual. `recalculo-paso` reanuda un cálculo pausado al volver a invocarse.
-- ---------------------------------------------------------------------------
create function public.pausar_calculo(p_id_calculo integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  perform public.exigir_admin();

  select estado into v_estado from public.calculo_sugerida where id_calculo = p_id_calculo for update;
  if v_estado is null then
    raise exception 'El cálculo % no existe.', p_id_calculo;
  end if;
  if v_estado <> 'en_proceso' then
    raise exception 'Solo se pausa un cálculo en proceso; el % está %.', p_id_calculo, v_estado;
  end if;

  update public.calculo_sugerida
  set estado = 'pausado', mensaje_error = 'Pausado por el administrador. Reanúdalo cuando quieras.'
  where id_calculo = p_id_calculo;
end;
$$;
revoke execute on function public.pausar_calculo(integer) from public, anon;
grant execute on function public.pausar_calculo(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Guardado del resultado: misma firma y permisos; agrega la verificación de n_i, c_i e IE.
-- IL e IS las calcula guios-core en el navegador del administrador (ADR-002).
-- ---------------------------------------------------------------------------
create or replace function public.guardar_resultado_calculo(p_id_calculo integer, p_filas jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
  v_factores integer;
begin
  perform public.exigir_admin();

  select estado into v_estado from public.calculo_sugerida where id_calculo = p_id_calculo for update;
  if v_estado is null then
    raise exception 'El cálculo % no existe.', p_id_calculo;
  end if;
  if v_estado not in ('en_proceso', 'pausado') then
    raise exception 'El cálculo % está %: no admite resultados.', p_id_calculo, v_estado;
  end if;
  -- Cada subfactor del catálogo debe tener su paso hecho (ningún pendiente ni con error).
  if exists (select 1 from public.recalculo_paso
             where id_calculo = p_id_calculo and estado <> 'hecho')
     or (select count(*) from public.recalculo_paso
         where id_calculo = p_id_calculo and estado = 'hecho')
        <> (select count(*) from public.subfactor) then
    raise exception 'El cálculo % tiene pasos sin terminar.', p_id_calculo;
  end if;

  select count(*) into v_factores from public.factor;
  if jsonb_typeof(p_filas) is distinct from 'array'
     or jsonb_array_length(p_filas) <> 18
     or v_factores <> 18
     or (select count(distinct (e ->> 'id_factor')::integer) from jsonb_array_elements(p_filas) e) <> 18 then
    raise exception 'Se esperan exactamente 18 filas, una por factor del catálogo.';
  end if;

  -- n_i, c_i (suma de las citas de cada subfactor) e IE deben ser los de la base.
  if exists (
    select 1
    from jsonb_to_recordset(p_filas) as x (
      id_factor integer, num_subfactores integer, total_citas integer, importancia_experto integer)
    left join public.factor f on f.id_factor = x.id_factor
    where f.id_factor is null
       or x.importancia_experto is distinct from f.importancia_experto
       or x.num_subfactores is distinct from
          (select count(*) from public.subfactor s where s.id_factor = x.id_factor)
       or x.total_citas is distinct from
          (select count(*) from public.referencia r
           join public.subfactor s on s.id_subfactor = r.id_subfactor
           where r.id_calculo = p_id_calculo and s.id_factor = x.id_factor)
  ) then
    raise exception 'Las filas del cálculo % no coinciden con el conteo de citas ni con el catálogo.',
      p_id_calculo;
  end if;

  insert into public.sugerida_factor (
    id_calculo, id_factor, num_subfactores, total_citas, razon_citas,
    importancia_experto, importancia_literatura, importancia_sugerida)
  select p_id_calculo, x.id_factor, x.num_subfactores, x.total_citas, x.razon_citas,
         x.importancia_experto, x.importancia_literatura, x.importancia_sugerida
  from jsonb_to_recordset(p_filas) as x (
    id_factor integer, num_subfactores smallint, total_citas integer, razon_citas numeric,
    importancia_experto smallint, importancia_literatura smallint, importancia_sugerida smallint);

  update public.calculo_sugerida
  set estado = 'completado', progreso = 18, mensaje_error = null
  where id_calculo = p_id_calculo;
end;
$$;

-- ---------------------------------------------------------------------------
-- Descartar: misma firma y permisos; un cálculo publicado (vigente o histórico) se conserva.
-- ---------------------------------------------------------------------------
create or replace function public.descartar_calculo(p_id_calculo integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  perform public.exigir_admin();

  select estado into v_estado from public.calculo_sugerida where id_calculo = p_id_calculo for update;
  if v_estado is null then
    raise exception 'El cálculo % no existe.', p_id_calculo;
  end if;
  if v_estado = 'publicado' then
    raise exception 'No se puede descartar un cálculo publicado: forma parte del histórico.';
  end if;
  if v_estado = 'descartado' then
    raise exception 'El cálculo % ya está descartado.', p_id_calculo;
  end if;
  if exists (select 1 from public.evaluacion where id_calculo = p_id_calculo) then
    raise exception 'No se puede descartar el cálculo %: lo usan evaluaciones.', p_id_calculo;
  end if;

  update public.calculo_sugerida set estado = 'descartado' where id_calculo = p_id_calculo;
end;
$$;
