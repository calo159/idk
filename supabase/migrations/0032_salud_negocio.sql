-- 0032: puntaje de salud del negocio (Fase 3: 3.14).
--
-- La base de datos entrega las MEDIDAS crudas de los últimos 30 días (ventas netas, utilidad, costo de lo vendido, valor del
-- inventario, deuda vencida, merma y faltantes de caja). El puntaje y los consejos se calculan en la aplicación (src/lib/salud.ts),
-- así se pueden ajustar sin tocar datos. Cada vez que el dueño consulta se guarda una foto del día, para mostrar la tendencia.

create table salud_historial (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  fecha date not null,
  metricas jsonb not null,
  creado_en timestamptz not null default now(),
  unique (organizacion_id, fecha)
);
alter table salud_historial enable row level security;
create policy salud_leer on salud_historial for select
  using (tiene_rol(organizacion_id, array['dueno','admin','contador']::rol_miembro[]));

create or replace function calcular_metricas_salud(p_org uuid, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare desde date := p_hasta - 29; r jsonb;
begin
  with v as (
    select * from ventas ve
     where ve.organizacion_id = p_org and ve.estado = 'confirmado'
       and (ve.creado_en at time zone 'America/Bogota')::date between desde and p_hasta
  ), dv as (
    select coalesce(sum(x.total), 0) as total, coalesce(sum(x.costo_total), 0) as costo
      from devoluciones_cliente x
     where x.organizacion_id = p_org and (x.creado_en at time zone 'America/Bogota')::date between desde and p_hasta
  )
  select jsonb_build_object(
    'desde', desde, 'hasta', p_hasta,
    'ventas_n', (select count(*) from v),
    'ventas_netas', ((select coalesce(sum(total), 0) from v) - (select total from dv))::numeric(14,2),
    'utilidad', ((select coalesce(sum(total - costo_total), 0) from v) - (select total - costo from dv))::numeric(14,2),
    'costo_ventas', ((select coalesce(sum(costo_total), 0) from v) - (select costo from dv))::numeric(14,2),
    'inventario_valor', (select coalesce(sum(e.cantidad * e.costo_promedio), 0) from existencias e
                           join productos p on p.id = e.producto_id
                          where e.organizacion_id = p_org and e.cantidad > 0 and p.activo)::numeric(14,2),
    'vencido', (select coalesce(sum(c.vencido), 0) from calcular_cartera(p_org) c)::numeric(14,2),
    'por_cobrar', (select coalesce(sum(c.saldo), 0) from clientes c where c.organizacion_id = p_org and c.saldo > 0)::numeric(14,2),
    -- Pérdidas: mercancía dada de baja (ajustes de salida y diferencias de conteo) y faltantes de caja.
    'merma', (select coalesce(sum(m.cantidad * m.costo_unitario), 0) from movimientos_inventario m
               where m.organizacion_id = p_org and m.tipo = 'ajuste_salida'
                 and (m.creado_en at time zone 'America/Bogota')::date between desde and p_hasta)::numeric(14,2),
    'faltantes_caja', (select coalesce(sum(-t.diferencia), 0) from turnos_caja t
                        where t.organizacion_id = p_org and t.estado = 'cerrado' and t.diferencia < 0
                          and (t.cerrado_en at time zone 'America/Bogota')::date between desde and p_hasta)::numeric(14,2)
  ) into r;
  return r;
end $$;

-- Medidas de hoy + la foto más cercana a hace 30 días (para la tendencia). Guarda la foto de hoy.
create or replace function metricas_salud(p_org uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare hoy date := (now() at time zone 'America/Bogota')::date; actual jsonb; previo record;
begin
  if not tiene_rol(p_org, array['dueno','admin','contador']::rol_miembro[]) then raise exception 'Sin permiso para ver la salud del negocio'; end if;
  actual := calcular_metricas_salud(p_org, hoy);
  insert into salud_historial (organizacion_id, fecha, metricas) values (p_org, hoy, actual)
  on conflict (organizacion_id, fecha) do update set metricas = excluded.metricas, creado_en = now();
  select fecha, metricas into previo from salud_historial
   where organizacion_id = p_org and fecha between hoy - 45 and hoy - 25
   order by abs((hoy - 30) - fecha) limit 1;
  return jsonb_build_object('actual', actual, 'anterior', case when previo.fecha is null then null else jsonb_build_object('fecha', previo.fecha, 'metricas', previo.metricas) end);
end $$;

revoke all on function calcular_metricas_salud(uuid, date) from public, anon, authenticated;
revoke all on function metricas_salud(uuid) from public, anon;
grant execute on function metricas_salud(uuid) to authenticated;
