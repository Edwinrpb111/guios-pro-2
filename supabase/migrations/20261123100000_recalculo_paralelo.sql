-- 20261123100000_recalculo_paralelo.sql — tandas en paralelo y sin razonamiento (issue #45, S16a/b).
-- Migración aditiva sobre 20261121100000_proveedor_openai.sql (ya desplegada: no se edita).
-- Dos parámetros nuevos, ambos opcionales (NULL = usar la variable de entorno o su valor por defecto):
-- * llamadas_simultaneas: cuántas tandas de un paso se mandan a la IA a la vez (1..10).
--   NULL = LLM_LLAMADAS_SIMULTANEAS o 5.
-- * desactivar_razonamiento: pide al modelo que no «piense» antes de responder (más rápido).
--   NULL = LLM_DESACTIVAR_RAZONAMIENTO (`true`/`false`) o false.
-- Ninguno cambia el resultado del cálculo (RNF-09), así que no se guardan en `parametros` del
-- cálculo: se leen en cada paso, como llamadas_por_minuto, y un cambio se aplica al siguiente paso.
-- El registro de cambios y configuracion_recalculo_servicio() los incluyen; solo un administrador
-- los lee y los cambia (ADR-010). Detalle en docs/decisiones/ADR-014.

-- ---------------------------------------------------------------------------
-- Parámetros nuevos
-- ---------------------------------------------------------------------------
alter table public.configuracion_recalculo
  add column llamadas_simultaneas integer check (llamadas_simultaneas between 1 and 10),
  add column desactivar_razonamiento boolean;

-- Misma regla que el resto de parámetros: solo un administrador los cambia (RLS ya lo limita).
grant update (llamadas_simultaneas, desactivar_razonamiento)
  on public.configuracion_recalculo to authenticated;

-- ---------------------------------------------------------------------------
-- Registro de cambios: ahora también anota las dos columnas nuevas (nunca claves).
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
      'llamadas_simultaneas', new.llamadas_simultaneas,
      'desactivar_razonamiento', new.desactivar_razonamiento,
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
         old.llamadas_por_minuto, old.llamadas_simultaneas, old.desactivar_razonamiento,
         old.openai_base_url, old.openai_modelo)
        is distinct from
        (new.proveedor_llm, new.modelo, new.umbral, new.max_candidatos, new.crossref_mailto,
         new.llamadas_por_minuto, new.llamadas_simultaneas, new.desactivar_razonamiento,
         new.openai_base_url, new.openai_modelo))
  execute function public.registrar_cambio_configuracion();

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
  llamadas_simultaneas integer,
  desactivar_razonamiento boolean,
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
         c.llamadas_simultaneas, c.desactivar_razonamiento,
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
