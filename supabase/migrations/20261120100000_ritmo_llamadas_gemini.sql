-- 20261120100000_ritmo_llamadas_gemini.sql — ritmo de llamadas a Gemini por minuto (issue #39).
-- Migración aditiva sobre 20261119100000_configuracion_recalculo.sql (ya desplegada: no se edita).
-- * configuracion_recalculo.llamadas_por_minuto: máximo de llamadas por minuto que la Edge
--   Function hace a Gemini (el plan gratis ronda 15). NULL = usar LLM_LLAMADAS_POR_MINUTO o 15.
-- * El registro de cambios y configuracion_recalculo_servicio() también lo incluyen.
-- Detalle en docs/decisiones/ADR-010.

alter table public.configuracion_recalculo
  add column llamadas_por_minuto integer check (llamadas_por_minuto between 1 and 1000);

-- Misma regla que el resto de parámetros: solo un administrador lo cambia (RLS ya lo limita).
grant update (llamadas_por_minuto) on public.configuracion_recalculo to authenticated;

-- Registro de cambios: ahora también anota el ritmo.
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
      'llamadas_por_minuto', new.llamadas_por_minuto),
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
         old.llamadas_por_minuto)
        is distinct from
        (new.proveedor_llm, new.modelo, new.umbral, new.max_candidatos, new.crossref_mailto,
         new.llamadas_por_minuto))
  execute function public.registrar_cambio_configuracion();

-- Lectura para las Edge Functions: cambia el tipo devuelto, así que se recrea la función.
drop function public.configuracion_recalculo_servicio();
create function public.configuracion_recalculo_servicio()
returns table (
  proveedor_llm text,
  modelo text,
  umbral numeric,
  max_candidatos integer,
  llamadas_por_minuto integer,
  crossref_mailto text,
  gemini_api_key text,
  openalex_api_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.proveedor_llm, c.modelo, c.umbral, c.max_candidatos, c.llamadas_por_minuto,
         c.crossref_mailto,
         (select d.decrypted_secret from vault.decrypted_secrets d
          where d.name = 'guios_recalculo_gemini_api_key'),
         (select d.decrypted_secret from vault.decrypted_secrets d
          where d.name = 'guios_recalculo_openalex_api_key')
  from public.configuracion_recalculo c;
$$;
revoke execute on function public.configuracion_recalculo_servicio() from public, anon, authenticated;
grant execute on function public.configuracion_recalculo_servicio() to service_role;
