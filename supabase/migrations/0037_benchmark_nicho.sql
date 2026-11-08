-- 0037: comparación anónima con negocios del mismo nicho (Fase 4: 4.5).
--
-- PRIVACIDAD (reglas que no se negocian):
--   * Es OPT-IN: un negocio solo entra al grupo —y solo puede ver la comparación— si activa «compartir».
--     Al desactivarlo sale del grupo de inmediato.
--   * Se comparten únicamente 5 razones calculadas (margen, rotación, deuda vencida, pérdidas, ticket promedio), nunca montos
--     absolutos de ventas, ni nombres, ni productos, ni clientes.
--   * Grupos de al menos 6 negocios (sin contar al que consulta); si hay menos, no se muestra nada.
--   * La respuesta solo trae medidas agregadas (percentiles 25/50/75 y en qué posición quedas): ni ids ni nombres de otros negocios.
--   * Se usa la última foto de salud de cada negocio, de los últimos 14 días y con al menos 10 ventas en el mes.

alter table organizaciones add column if not exists compartir_benchmark boolean not null default false;

create or replace function configurar_benchmark(p_org uuid, p_compartir boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno']::rol_miembro[]) then raise exception 'Solo el dueño decide si comparte sus cifras'; end if;
  update organizaciones set compartir_benchmark = p_compartir where id = p_org;
end $$;

-- Razones de una foto de salud. Devuelve null si no hay base para calcularlas.
create or replace function razones_de_metricas(m jsonb) returns jsonb
language sql immutable as $$
  select case
    when coalesce((m ->> 'ventas_netas')::numeric, 0) <= 0 or coalesce((m ->> 'ventas_n')::integer, 0) < 10 then null
    else jsonb_build_object(
      'margen', round((m ->> 'utilidad')::numeric / (m ->> 'ventas_netas')::numeric * 100, 2),
      'rotacion', case when coalesce((m ->> 'costo_ventas')::numeric, 0) > 0 and coalesce((m ->> 'inventario_valor')::numeric, 0) > 0
                       then round((m ->> 'inventario_valor')::numeric / ((m ->> 'costo_ventas')::numeric / 30), 1) end,
      'vencido', round(coalesce((m ->> 'vencido')::numeric, 0) / (m ->> 'ventas_netas')::numeric * 100, 2),
      'perdidas', round((coalesce((m ->> 'merma')::numeric, 0) + coalesce((m ->> 'faltantes_caja')::numeric, 0)) / (m ->> 'ventas_netas')::numeric * 100, 2),
      'ticket', round((m ->> 'ventas_netas')::numeric / (m ->> 'ventas_n')::numeric, 0))
  end
$$;

create or replace function benchmark_nicho(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o record; mias jsonb; n integer; razones jsonb;
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Sin permiso para ver la comparación'; end if;
  select nicho, compartir_benchmark into o from organizaciones where id = p_org;
  if not o.compartir_benchmark then return jsonb_build_object('compartiendo', false, 'nicho', o.nicho); end if;

  mias := razones_de_metricas(calcular_metricas_salud(p_org, (now() at time zone 'America/Bogota')::date));
  if mias is null then return jsonb_build_object('compartiendo', true, 'nicho', o.nicho, 'sin_datos_propios', true); end if;

  with cohorte as (
    select razones_de_metricas(h.metricas) as r
      from organizaciones x
      join lateral (select h.metricas from salud_historial h
                     where h.organizacion_id = x.id and h.fecha >= (now() at time zone 'America/Bogota')::date - 14
                     order by h.fecha desc limit 1) h on true
     where x.nicho = o.nicho and x.compartir_benchmark and x.id <> p_org),
  validos as (select r from cohorte where r is not null),
  valores as (select k, (r ->> k)::numeric as v from validos, unnest(array['margen', 'rotacion', 'vencido', 'perdidas', 'ticket']) as k where r ->> k is not null)
  select (select count(*) from validos),
         coalesce((select jsonb_object_agg(t.k, jsonb_build_object(
                     'tuyo', (mias ->> t.k)::numeric,
                     'p25', round(t.p25::numeric, 2), 'mediana', round(t.p50::numeric, 2), 'p75', round(t.p75::numeric, 2),
                     -- Porción del grupo con un valor MENOR / MAYOR al tuyo (0 a 1); los empates no cuentan para ninguna.
                     'por_debajo', round(t.menores::numeric / t.n, 2), 'por_encima', round(t.mayores::numeric / t.n, 2)))
                     from (select k, count(*) as n,
                                  percentile_cont(0.25) within group (order by v) as p25,
                                  percentile_cont(0.5) within group (order by v) as p50,
                                  percentile_cont(0.75) within group (order by v) as p75,
                                  count(*) filter (where v < (mias ->> k)::numeric) as menores,
                                  count(*) filter (where v > (mias ->> k)::numeric) as mayores
                             from valores where (mias ->> k) is not null group by k having count(*) >= 6) t), '{}'::jsonb)
    into n, razones;
  if n < 6 then return jsonb_build_object('compartiendo', true, 'nicho', o.nicho, 'cohorte_insuficiente', true); end if;
  return jsonb_build_object('compartiendo', true, 'nicho', o.nicho, 'negocios', n, 'razones', razones);
end $$;

revoke all on function razones_de_metricas(jsonb) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array['configurar_benchmark(uuid,boolean)', 'benchmark_nicho(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
