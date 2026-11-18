-- 0002_rls.sql — seguridad por fila (BRIEF §10.3). RLS activo en todas las tablas;
-- sin política para una operación = denegada.

-- es_admin(): security definer para leer `perfil` sin depender de sus políticas.
create function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfil
    where id = (select auth.uid()) and rol = 'administrador'
  );
$$;
revoke execute on function public.es_admin() from public, anon;
grant execute on function public.es_admin() to authenticated;

alter table public.organizacion enable row level security;
alter table public.perfil enable row level security;
alter table public.software_evaluado enable row level security;
alter table public.dimension enable row level security;
alter table public.factor enable row level security;
alter table public.subfactor enable row level security;
alter table public.calculo_sugerida enable row level security;
alter table public.sugerida_factor enable row level security;
alter table public.referencia enable row level security;
alter table public.recalculo_paso enable row level security;
alter table public.evaluacion enable row level security;
alter table public.valoracion_factor enable row level security;
alter table public.valoracion_subfactor enable row level security;

-- Catálogo: lectura para autenticados; escritura solo por migraciones y semilla.
create policy "catalogo: leer autenticado" on public.dimension
  for select to authenticated using (true);
create policy "catalogo: leer autenticado" on public.factor
  for select to authenticated using (true);
create policy "catalogo: leer autenticado" on public.subfactor
  for select to authenticated using (true);

-- Importancia sugerida: lectura para autenticados; escritura solo por las RPC de 0003.
create policy "calculo: leer autenticado" on public.calculo_sugerida
  for select to authenticated using (true);
create policy "calculo: leer autenticado" on public.sugerida_factor
  for select to authenticated using (true);

-- Recálculo: lectura solo para administradores; escritura solo con service_role.
create policy "recalculo: leer admin" on public.referencia
  for select to authenticated using ((select public.es_admin()));
create policy "recalculo: leer admin" on public.recalculo_paso
  for select to authenticated using ((select public.es_admin()));

-- Perfil: el propio usuario; el rol no se puede cambiar (privilegio por columna).
create policy "perfil: leer propio" on public.perfil
  for select to authenticated using (id = (select auth.uid()));
create policy "perfil: editar propio" on public.perfil
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
revoke insert, update, delete on public.perfil from anon, authenticated;
grant update (nombre_completo, id_organizacion) on public.perfil to authenticated;

-- Organización y software: su creador.
create policy "organizacion: creador" on public.organizacion
  for all to authenticated
  using (creado_por = (select auth.uid()))
  with check (creado_por = (select auth.uid()));
create policy "software: creador" on public.software_evaluado
  for all to authenticated
  using (creado_por = (select auth.uid()))
  with check (creado_por = (select auth.uid()));

-- Evaluación: su dueño; una evaluación finalizada no se modifica ni se borra.
create policy "evaluacion: leer dueño" on public.evaluacion
  for select to authenticated using (id_usuario = (select auth.uid()));
-- Un borrador nuevo usa el cálculo vigente (BRIEF §11.1); después, el cálculo y el dueño
-- no se cambian (privilegio por columna, abajo), así la IS usada queda como fotografía.
create policy "evaluacion: crear dueño" on public.evaluacion
  for insert to authenticated
  with check (
    id_usuario = (select auth.uid())
    and estado = 'en_curso'
    and exists (
      select 1 from public.calculo_sugerida c
      where c.id_calculo = evaluacion.id_calculo and c.vigente
    )
  );
create policy "evaluacion: editar en curso" on public.evaluacion
  for update to authenticated
  using (id_usuario = (select auth.uid()) and estado = 'en_curso')
  with check (id_usuario = (select auth.uid()));
create policy "evaluacion: borrar en curso" on public.evaluacion
  for delete to authenticated
  using (id_usuario = (select auth.uid()) and estado = 'en_curso');
revoke update on public.evaluacion from anon, authenticated;
grant update (id_software, titulo, estado, codigo_recomendacion, texto_recomendacion, causas)
  on public.evaluacion to authenticated;

-- Valoraciones: el dueño lee siempre; escribe solo mientras la evaluación está en curso.
create function public.es_evaluacion_propia(p_id_evaluacion integer, p_solo_en_curso boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.evaluacion
    where id_evaluacion = p_id_evaluacion
      and id_usuario = (select auth.uid())
      and (not p_solo_en_curso or estado = 'en_curso')
  );
$$;
revoke execute on function public.es_evaluacion_propia(integer, boolean) from public, anon;
grant execute on function public.es_evaluacion_propia(integer, boolean) to authenticated;

create policy "valoracion: leer dueño" on public.valoracion_factor
  for select to authenticated using (public.es_evaluacion_propia(id_evaluacion, false));
create policy "valoracion: crear en curso" on public.valoracion_factor
  for insert to authenticated with check (public.es_evaluacion_propia(id_evaluacion, true));
create policy "valoracion: editar en curso" on public.valoracion_factor
  for update to authenticated
  using (public.es_evaluacion_propia(id_evaluacion, true))
  with check (public.es_evaluacion_propia(id_evaluacion, true));
create policy "valoracion: borrar en curso" on public.valoracion_factor
  for delete to authenticated using (public.es_evaluacion_propia(id_evaluacion, true));

create function public.es_valoracion_propia(p_id_val_factor integer, p_solo_en_curso boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.valoracion_factor vf
    where vf.id_val_factor = p_id_val_factor
      and public.es_evaluacion_propia(vf.id_evaluacion, p_solo_en_curso)
  );
$$;
revoke execute on function public.es_valoracion_propia(integer, boolean) from public, anon;
grant execute on function public.es_valoracion_propia(integer, boolean) to authenticated;

create policy "valoracion: leer dueño" on public.valoracion_subfactor
  for select to authenticated using (public.es_valoracion_propia(id_val_factor, false));
create policy "valoracion: crear en curso" on public.valoracion_subfactor
  for insert to authenticated with check (public.es_valoracion_propia(id_val_factor, true));
create policy "valoracion: editar en curso" on public.valoracion_subfactor
  for update to authenticated
  using (public.es_valoracion_propia(id_val_factor, true))
  with check (public.es_valoracion_propia(id_val_factor, true));
create policy "valoracion: borrar en curso" on public.valoracion_subfactor
  for delete to authenticated using (public.es_valoracion_propia(id_val_factor, true));

-- TRUNCATE ignora RLS; REFERENCES y TRIGGER no los necesita el cliente.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
