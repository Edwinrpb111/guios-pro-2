-- Prueba de la semilla (BRIEF §10.4, §15.3): catálogo 3/18/61 y cálculo de IS de la tesis.
-- Se ejecuta con `npm run test:db` después de `npm run db:reset`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select is((select count(*)::int from public.dimension), 3, '3 dimensiones');
select is((select count(*)::int from public.factor), 18, '18 factores');
select is((select count(*)::int from public.subfactor), 61, '61 subfactores');
select is((select count(*)::int from public.subfactor where enunciado like '%códigofuente%'
                                                        or enunciado like '%es una sistemas%'),
  0, 'las erratas del CSV están corregidas');
select results_eq(
  $$ select nombre::text, alcance::text from public.factor where alcance = 'Ambos' $$,
  $$ values ('Soporte', 'Ambos') $$, 'solo Soporte tiene alcance Ambos');

select results_eq(
  $$ select origen::text, estado::text, vigente, etiqueta_rango::text, bases_datos::text, anio_inicio, anio_fin
     from public.calculo_sugerida $$,
  $$ values ('tesis', 'publicado', true, 'RSL de la tesis', 'IEEE, ACM, Scopus, WoS', null::smallint, null::smallint) $$,
  'un único cálculo: el de la tesis, publicado y vigente');

select is((select count(*)::int from public.sugerida_factor sf
           join public.calculo_sugerida c using (id_calculo) where c.vigente),
  18, '18 filas de sugerida_factor en el cálculo vigente');

-- NS, TC, IL e IS de la Tabla 5.3 (BRIEF §4.1), en el orden del catálogo.
select results_eq(
  $$ select f.nombre::text, sf.num_subfactores::int, sf.total_citas, sf.importancia_literatura::int,
            sf.importancia_sugerida::int
     from public.sugerida_factor sf join public.factor f using (id_factor) order by f.orden $$,
  $$ values
     ('Compatibilidad', 8, 33, 3, 3), ('Personalización', 6, 30, 4, 3), ('Prueba', 1, 4, 3, 3),
     ('Fiabilidad', 5, 19, 3, 3), ('Reusabilidad', 2, 5, 2, 2), ('Usabilidad', 4, 14, 2, 2),
     ('Mantenibilidad', 1, 4, 3, 3), ('Portabilidad', 2, 4, 2, 2), ('Documentación', 11, 20, 1, 2),
     ('Formación', 4, 27, 4, 3), ('Tiempo de adopción', 2, 2, 1, 2),
     ('Casos de estudio de adopción FLOSS', 1, 1, 1, 2),
     ('Centralidad de la tecnología de la información', 2, 2, 1, 2),
     ('Apoyo de la alta dirección', 1, 5, 4, 3), ('Bloqueo de proveedores', 1, 3, 2, 2),
     ('Soporte', 6, 43, 4, 3), ('Actitud hacia el cambio', 2, 3, 1, 2), ('Coste total de propiedad', 2, 24, 4, 3) $$,
  'NS, TC, IL e IS coinciden con la Tabla 5.3');

select results_eq(
  $$ select f.nombre::text, count(s.id_subfactor)::int from public.factor f
     join public.subfactor s using (id_factor) group by f.id_factor, f.nombre
     having count(s.id_subfactor) <> (select num_subfactores from public.sugerida_factor sf
                                      where sf.id_factor = f.id_factor) $$,
  $$ select null::text, null::int where false $$,
  'cada factor tiene tantos subfactores como su NS');

select * from finish();
rollback;
