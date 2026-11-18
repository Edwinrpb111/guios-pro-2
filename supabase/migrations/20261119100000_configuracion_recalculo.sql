-- 20261119100000_configuracion_recalculo.sql — configuración del recálculo desde la app (issue #33).
-- * configuracion_recalculo: una sola fila con los parámetros no secretos (proveedor, modelo,
--   umbral, máximo de candidatos, correo de Crossref). Un valor NULL significa «usar el secreto
--   de entorno de la Edge Function». Solo un administrador la lee y la cambia.
-- * Claves GEMINI_API_KEY y OPENALEX_API_KEY en Supabase Vault, de solo escritura: el cliente
--   puede guardarlas, borrarlas y saber si están configuradas, nunca leerlas.
-- * configuracion_recalculo_cambio: quién y cuándo hizo cada cambio (sin valores de claves).
-- * configuracion_recalculo_servicio(): la configuración con las claves descifradas, solo para
--   las Edge Functions (service_role).
-- ORIGENES_PERMITIDOS sigue siendo un secreto de Supabase. Detalle en docs/decisiones/ADR-010.

create extension if not exists supabase_vault;

-- ---------------------------------------------------------------------------
-- Parámetros no secretos (una sola fila)
-- ---------------------------------------------------------------------------
create table public.configuracion_recalculo (
  id boolean primary key default true check (id),
  proveedor_llm text check (proveedor_llm in ('gemini', 'fake')),
  modelo text check (modelo is null or (modelo = btrim(modelo) and length(modelo) between 1 and 100)),
  umbral numeric check (umbral between 0 and 1),
  max_candidatos integer check (max_candidatos between 1 and 200),
  crossref_mailto text check (
    crossref_mailto is null
    or (length(crossref_mailto) <= 254 and crossref_mailto ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  actualizado_por uuid references public.perfil (id) on delete set null,
  actualizado_en timestamptz not null default now()
);
insert into public.configuracion_recalculo (id) values (true);

-- Registro de cambios: lo escriben solo el trigger y las funciones de claves.
create table public.configuracion_recalculo_cambio (
  id_cambio bigint generated always as identity primary key,
  cambio text not null check (length(cambio) between 1 and 100),
  detalle jsonb,
  realizado_por uuid default auth.uid() references public.perfil (id) on delete set null,
  realizado_por_nombre text,
  realizado_en timestamptz not null default now()
);
create index idx_configuracion_cambio_realizado_por
  on public.configuracion_recalculo_cambio (realizado_por);

alter table public.configuracion_recalculo enable row level security;
alter table public.configuracion_recalculo_cambio enable row level security;

create policy "configuracion: leer admin" on public.configuracion_recalculo
  for select to authenticated using ((select public.es_admin()));
create policy "configuracion: editar admin" on public.configuracion_recalculo
  for update to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));
create policy "configuracion: leer admin" on public.configuracion_recalculo_cambio
  for select to authenticated using ((select public.es_admin()));

-- Sin insert ni delete para el cliente; solo se actualizan los parámetros, nunca la auditoría.
revoke all on public.configuracion_recalculo, public.configuracion_recalculo_cambio
  from public, anon, authenticated;
grant select on public.configuracion_recalculo, public.configuracion_recalculo_cambio
  to authenticated;
grant update (proveedor_llm, modelo, umbral, max_candidatos, crossref_mailto)
  on public.configuracion_recalculo to authenticated;

-- Quién y cuándo: lo fija la base, no el cliente. Solo registra cambios reales de parámetros.
create function public.registrar_cambio_configuracion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.actualizado_por := (select auth.uid());
  new.actualizado_en := now();
  insert into public.configuracion_recalculo_cambio (cambio, detalle, realizado_por, realizado_por_nombre)
  values (
    'parametros',
    jsonb_build_object(
      'proveedor_llm', new.proveedor_llm,
      'modelo', new.modelo,
      'umbral', new.umbral,
      'max_candidatos', new.max_candidatos,
      'crossref_mailto', new.crossref_mailto),
    new.actualizado_por,
    (select p.nombre_completo from public.perfil p where p.id = new.actualizado_por));
  return new;
end;
$$;
revoke execute on function public.registrar_cambio_configuracion() from public, anon, authenticated;

create trigger trg_configuracion_recalculo_cambio
  before update on public.configuracion_recalculo
  for each row
  when ((old.proveedor_llm, old.modelo, old.umbral, old.max_candidatos, old.crossref_mailto)
        is distinct from
        (new.proveedor_llm, new.modelo, new.umbral, new.max_candidatos, new.crossref_mailto))
  execute function public.registrar_cambio_configuracion();

-- ---------------------------------------------------------------------------
-- Claves en Vault (solo escritura para el administrador)
-- ---------------------------------------------------------------------------
-- Nombre del secreto en vault.secrets; falla con 22023 si la clave no es una de las conocidas.
create function public.nombre_secreto_recalculo(p_nombre text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_nombre is null or p_nombre not in ('GEMINI_API_KEY', 'OPENALEX_API_KEY') then
    raise exception 'Clave desconocida: usa GEMINI_API_KEY u OPENALEX_API_KEY.' using errcode = '22023';
  end if;
  return 'guios_recalculo_' || lower(p_nombre);
end;
$$;
revoke execute on function public.nombre_secreto_recalculo(text) from public, anon, authenticated;

create function public.guardar_clave_recalculo(p_nombre text, p_valor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secreto text;
  v_valor text := btrim(coalesce(p_valor, ''));
  v_id uuid;
begin
  perform public.exigir_admin();
  v_secreto := public.nombre_secreto_recalculo(p_nombre);
  if length(v_valor) = 0 or length(v_valor) > 1000 then
    raise exception 'La clave no puede estar vacía ni superar 1000 caracteres.' using errcode = '22023';
  end if;

  -- Serializa dos guardados simultáneos de la misma clave (el nombre es único en Vault).
  perform pg_advisory_xact_lock(hashtext(v_secreto));
  select s.id into v_id from vault.secrets s where s.name = v_secreto;
  if v_id is null then
    perform vault.create_secret(v_valor, v_secreto, 'Clave ' || p_nombre || ' del recálculo de IS (GUIOS PRO)');
  else
    perform vault.update_secret(v_id, v_valor);
  end if;

  insert into public.configuracion_recalculo_cambio (cambio, realizado_por_nombre)
  values ('clave ' || p_nombre || ' guardada',
          (select p.nombre_completo from public.perfil p where p.id = (select auth.uid())));
end;
$$;
revoke execute on function public.guardar_clave_recalculo(text, text) from public, anon;
grant execute on function public.guardar_clave_recalculo(text, text) to authenticated;

create function public.borrar_clave_recalculo(p_nombre text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secreto text;
begin
  perform public.exigir_admin();
  v_secreto := public.nombre_secreto_recalculo(p_nombre);
  perform pg_advisory_xact_lock(hashtext(v_secreto));
  delete from vault.secrets where name = v_secreto;

  insert into public.configuracion_recalculo_cambio (cambio, realizado_por_nombre)
  values ('clave ' || p_nombre || ' borrada',
          (select p.nombre_completo from public.perfil p where p.id = (select auth.uid())));
end;
$$;
revoke execute on function public.borrar_clave_recalculo(text) from public, anon;
grant execute on function public.borrar_clave_recalculo(text) to authenticated;

-- Solo el estado: si la clave está guardada y cuándo cambió. Nunca el valor.
create function public.estado_claves_recalculo()
returns table (nombre text, configurada boolean, actualizada_en timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exigir_admin();
  return query
    select c.nombre, s.id is not null, s.updated_at
    from (values ('GEMINI_API_KEY'), ('OPENALEX_API_KEY')) as c (nombre)
    left join vault.secrets s on s.name = 'guios_recalculo_' || lower(c.nombre)
    order by c.nombre;
end;
$$;
revoke execute on function public.estado_claves_recalculo() from public, anon;
grant execute on function public.estado_claves_recalculo() to authenticated;

-- ---------------------------------------------------------------------------
-- Lectura para las Edge Functions: parámetros y claves descifradas. Solo service_role.
-- ---------------------------------------------------------------------------
create function public.configuracion_recalculo_servicio()
returns table (
  proveedor_llm text,
  modelo text,
  umbral numeric,
  max_candidatos integer,
  crossref_mailto text,
  gemini_api_key text,
  openalex_api_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.proveedor_llm, c.modelo, c.umbral, c.max_candidatos, c.crossref_mailto,
         (select d.decrypted_secret from vault.decrypted_secrets d
          where d.name = 'guios_recalculo_gemini_api_key'),
         (select d.decrypted_secret from vault.decrypted_secrets d
          where d.name = 'guios_recalculo_openalex_api_key')
  from public.configuracion_recalculo c;
$$;
revoke execute on function public.configuracion_recalculo_servicio() from public, anon, authenticated;
grant execute on function public.configuracion_recalculo_servicio() to service_role;
