-- 20261122100000_registro_recalculo.sql — registro por paso del recálculo (issue #43, S15b).
-- Migración aditiva: no toca datos existentes ni migraciones ya desplegadas.
-- Tres columnas nuevas en recalculo_paso, escritas SOLO por la Edge Function recalculo-paso
-- (service_role) y leídas por el administrador desde la pantalla del recálculo:
-- * iniciado_en: cuándo empezó el último intento del paso. Se escribe al empezar, así un paso
--   que la plataforma cortó sigue mostrando que se inició (con duracion_ms nula).
-- * duracion_ms: cuánto tardó el último intento; nula mientras corre o si lo cortaron.
-- * registro: JSON del último intento (proveedor, búsquedas, lotes, aceptados, resultado y
--   mensaje). Nunca lleva claves, direcciones, prompts ni textos de candidatos.
-- Detalle en docs/decisiones/ADR-013.

alter table public.recalculo_paso
  add column iniciado_en timestamptz,
  add column duracion_ms integer check (duracion_ms >= 0),
  add column registro jsonb;

-- La política "recalculo: leer admin" (select, es_admin()) es por fila: cubre las columnas nuevas.
-- La escritura queda solo para service_role: el cliente no la necesita y, sin política de
-- escritura, RLS ya la bloquea; se quitan además los privilegios para que falle de forma explícita.
revoke insert, update, delete on public.recalculo_paso from anon, authenticated;
