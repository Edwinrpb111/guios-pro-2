-- 0003_funciones.sql — triggers y funciones RPC (BRIEF §10.2 ajuste 2, §11.2).
-- Las RPC son security definer y verifican es_admin(); los errores llevan mensaje en español.

-- ---------------------------------------------------------------------------
-- Ajuste 2: al registrarse, se crea el perfil con rol decisor.
-- ---------------------------------------------------------------------------
create function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfil (id, nombre_completo)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nombre_completo'), ''), new.email, 'Sin nombre'), 150)
  );
  return new;
end;
$$;
revoke execute on function public.crear_perfil() from public, anon, authenticated;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- fecha_actualizacion refleja la última modificación de la evaluación.
create function public.tocar_fecha_actualizacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.fecha_actualizacion := now();
  return new;
end;
$$;

create trigger evaluacion_fecha_actualizacion
  before update on public.evaluacion
  for each row execute function public.tocar_fecha_actualizacion();

-- ---------------------------------------------------------------------------
-- Funciones de §11.2
-- ---------------------------------------------------------------------------
create function public.exigir_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede realizar esta operación.' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.exigir_admin() from public, anon, authenticated;

-- Por factor: número de subfactores y filas de `referencia` del cálculo (ajuste 7).
create function public.conteo_citas(p_id_calculo integer)
returns table (id_factor integer, num_subfactores integer, total_citas integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  return query
    select f.id_factor,
           count(distinct s.id_subfactor)::integer,
           count(r.id_referencia)::integer
    from public.factor f
    join public.subfactor s on s.id_factor = f.id_factor
    left join public.referencia r on r.id_subfactor = s.id_subfactor and r.id_calculo = p_id_calculo
    group by f.id_factor, f.orden
    order by f.orden;
end;
$$;

-- Inserta las 18 filas de sugerida_factor y deja el cálculo en `completado`.
create function public.guardar_resultado_calculo(p_id_calculo integer, p_filas jsonb)
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

-- En una transacción: desmarca el vigente anterior y publica este como vigente.
create function public.publicar_calculo(p_id_calculo integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  perform public.exigir_admin();

  -- Bloquea el vigente actual para serializar publicaciones concurrentes.
  perform 1 from public.calculo_sugerida where vigente for update;
  select estado into v_estado from public.calculo_sugerida where id_calculo = p_id_calculo for update;
  if v_estado is null then
    raise exception 'El cálculo % no existe.', p_id_calculo;
  end if;
  if v_estado <> 'completado' then
    raise exception 'Solo se publica un cálculo completado; el % está %.', p_id_calculo, v_estado;
  end if;

  update public.calculo_sugerida set vigente = false where vigente;
  update public.calculo_sugerida set estado = 'publicado', vigente = true where id_calculo = p_id_calculo;
end;
$$;

-- Marca el cálculo como descartado. No se descarta el vigente ni uno que usan evaluaciones,
-- porque estas guardan su IS como fotografía (trampa 9).
create function public.descartar_calculo(p_id_calculo integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vigente boolean;
begin
  perform public.exigir_admin();

  select vigente into v_vigente from public.calculo_sugerida where id_calculo = p_id_calculo for update;
  if v_vigente is null then
    raise exception 'El cálculo % no existe.', p_id_calculo;
  end if;
  if v_vigente then
    raise exception 'No se puede descartar el cálculo vigente.';
  end if;
  if exists (select 1 from public.evaluacion where id_calculo = p_id_calculo) then
    raise exception 'No se puede descartar el cálculo %: lo usan evaluaciones.', p_id_calculo;
  end if;

  update public.calculo_sugerida set estado = 'descartado' where id_calculo = p_id_calculo;
end;
$$;

revoke execute on function public.conteo_citas(integer) from public, anon;
revoke execute on function public.guardar_resultado_calculo(integer, jsonb) from public, anon;
revoke execute on function public.publicar_calculo(integer) from public, anon;
revoke execute on function public.descartar_calculo(integer) from public, anon;
grant execute on function public.conteo_citas(integer) to authenticated;
grant execute on function public.guardar_resultado_calculo(integer, jsonb) to authenticated;
grant execute on function public.publicar_calculo(integer) to authenticated;
grant execute on function public.descartar_calculo(integer) to authenticated;
