-- 20261121100000_proveedor_openai.sql — proveedor del clasificador «compatible con OpenAI» (issue #40).
-- Migración aditiva sobre 20261120100000_ritmo_llamadas_gemini.sql (ya desplegada: no se edita).
-- * proveedor_llm acepta también 'openai' (OpenRouter, Groq, DeepSeek, Mistral, OpenAI…).
-- * Columnas nuevas, propias de ese proveedor (no se reutiliza `modelo`: cambiar de proveedor no
--   debe pisar el modelo de Gemini, y el patrón de `modelo` no admite «/» ni «:»):
--     openai_base_url: dirección base https, sin credenciales, consulta ni fragmento (≤ 200).
--     openai_modelo:   nombre del modelo (letras, dígitos y . _ : / @ -), va en el cuerpo JSON.
--   NULL = usar OPENAI_COMPAT_BASE_URL / OPENAI_COMPAT_MODEL del entorno.
-- * La clave OPENAI_COMPAT_API_KEY entra en las funciones de Vault (solo escritura) y se
--   devuelve descifrada únicamente en configuracion_recalculo_servicio() (service_role).
-- * El registro de cambios y configuracion_recalculo_servicio() incluyen las columnas nuevas.
-- Detalle en docs/decisiones/ADR-012.

-- ---------------------------------------------------------------------------
-- Parámetros nuevos
-- ---------------------------------------------------------------------------
alter table public.configuracion_recalculo
  drop constraint configuracion_recalculo_proveedor_llm_check;
alter table public.configuracion_recalculo
  add constraint configuracion_recalculo_proveedor_llm_check
  check (proveedor_llm in ('gemini', 'openai', 'fake'));

alter table public.configuracion_recalculo
  add column openai_base_url text check (
    openai_base_url is null
    or (length(openai_base_url) <= 200
        -- https://servidor[:puerto][/ruta]: sin «@» (credenciales), «?», «#», espacios ni «\».
        and openai_base_url ~ '^https://[^/?#@\\[:space:]]+(/[^?#\\[:space:]]*)?$')),
  add column openai_modelo text check (
    openai_modelo is null or openai_modelo ~ '^[A-Za-z0-9._:/@-]{1,150}$');

-- Misma regla que el resto de parámetros: solo un administrador los cambia (RLS ya lo limita).
grant update (openai_base_url, openai_modelo) on public.configuracion_recalculo to authenticated;

-- ---------------------------------------------------------------------------
-- Registro de cambios: ahora también anota la dirección base y el modelo (nunca claves).
-- ---------------------------------------------------------------------------
create or replace function public.registrar_cambio_configuracion()
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
      'crossref_mailto', new.crossref_mailto,
      'llamadas_por_minuto', new.llamadas_por_minuto,
      'openai_base_url', new.openai_base_url,
      'openai_modelo', new.openai_modelo),
    new.actualizado_por,
    (select p.nombre_completo from public.perfil p where p.id = new.actualizado_por));
  return new;
end;
$$;
revoke execute on function public.registrar_cambio_configuracion() from public, anon, authenticated;

drop trigger trg_configuracion_recalculo_cambio on public.configuracion_recalculo;
create trigger trg_configuracion_recalculo_cambio
  before update on public.configuracion_recalculo
  for each row
  when ((old.proveedor_llm, old.modelo, old.umbral, old.max_candidatos, old.crossref_mailto,
         old.llamadas_por_minuto, old.openai_base_url, old.openai_modelo)
        is distinct from
        (new.proveedor_llm, new.modelo, new.umbral, new.max_candidatos, new.crossref_mailto,
         new.llamadas_por_minuto, new.openai_base_url, new.openai_modelo))
  execute function public.registrar_cambio_configuracion();

-- ---------------------------------------------------------------------------
-- Claves en Vault: se agrega OPENAI_COMPAT_API_KEY. guardar_clave_recalculo y
-- borrar_clave_recalculo no cambian: ya validan el nombre con nombre_secreto_recalculo().
-- ---------------------------------------------------------------------------
create or replace function public.nombre_secreto_recalculo(p_nombre text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_nombre is null
     or p_nombre not in ('GEMINI_API_KEY', 'OPENAI_COMPAT_API_KEY', 'OPENALEX_API_KEY') then
    raise exception 'Clave desconocida: usa GEMINI_API_KEY, OPENAI_COMPAT_API_KEY u OPENALEX_API_KEY.'
      using errcode = '22023';
  end if;
  return 'guios_recalculo_' || lower(p_nombre);
end;
$$;
revoke execute on function public.nombre_secreto_recalculo(text) from public, anon, authenticated;

-- Solo el estado: si la clave está guardada y cuándo cambió. Nunca el valor.
create or replace function public.estado_claves_recalculo()
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
    from (values ('GEMINI_API_KEY'), ('OPENAI_COMPAT_API_KEY'), ('OPENALEX_API_KEY')) as c (nombre)
    left join vault.secrets s on s.name = 'guios_recalculo_' || lower(c.nombre)
    order by c.nombre;
end;
$$;
revoke execute on function public.estado_claves_recalculo() from public, anon;
grant execute on function public.estado_claves_recalculo() to authenticated;

-- ---------------------------------------------------------------------------
-- Lectura para las Edge Functions: cambia el tipo devuelto, así que se recrea la función.
-- Parámetros y claves descifradas; solo service_role.
-- ---------------------------------------------------------------------------
drop function public.configuracion_recalculo_servicio();
create function public.configuracion_recalculo_servicio()
returns table (
  proveedor_llm text,
  modelo text,
  umbral numeric,
  max_candidatos integer,
  llamadas_por_minuto integer,
  crossref_mailto text,
  openai_base_url text,
  openai_modelo text,
  gemini_api_key text,
  openai_compat_api_key text,
  openalex_api_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.proveedor_llm, c.modelo, c.umbral, c.max_candidatos, c.llamadas_por_minuto,
         c.crossref_mailto, c.openai_base_url, c.openai_modelo,
         (select d.decrypted_secret from vault.decrypted_secrets d
          where d.name = 'guios_recalculo_gemini_api_key'),
         (select d.decrypted_secret from vault.decrypted_secrets d
          where d.name = 'guios_recalculo_openai_compat_api_key'),
         (select d.decrypted_secret from vault.decrypted_secrets d
          where d.name = 'guios_recalculo_openalex_api_key')
  from public.configuracion_recalculo c;
$$;
revoke execute on function public.configuracion_recalculo_servicio() from public, anon, authenticated;
grant execute on function public.configuracion_recalculo_servicio() to service_role;
