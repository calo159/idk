-- 0010: reportes de ventas (dashboard del dueño y pantalla de reportes).
-- Todas las funciones:
--   * agrupan por DÍA DE BOGOTÁ (una venta a las 11:30 p. m. cuenta para ese día, no para el siguiente en UTC),
--   * solo cuentan ventas confirmadas (las anuladas no suman),
--   * exigen rol dueño, admin o contador (muestran utilidad y costos),
--   * validan que el rango sea razonable (máx. 366 días).

create or replace function reportes_validar(p_org uuid, p_desde date, p_hasta date) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','contador']::rol_miembro[]) then
    raise exception 'Sin permiso para ver reportes';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Rango de fechas inválido';
  end if;
  if p_hasta - p_desde > 366 then
    raise exception 'El rango máximo es de un año';
  end if;
end $$;

create or replace function reporte_ventas_diarias(p_org uuid, p_desde date, p_hasta date)
returns table (dia date, ventas bigint, total numeric, costo numeric, utilidad numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform reportes_validar(p_org, p_desde, p_hasta);
  return query
  select d::date,
         count(v.id),
         coalesce(sum(v.total), 0)::numeric,
         coalesce(sum(v.costo_total), 0)::numeric,
         coalesce(sum(v.total - v.costo_total), 0)::numeric
    from generate_series(p_desde, p_hasta, interval '1 day') d
    left join ventas v on v.organizacion_id = p_org and v.estado = 'confirmado'
                      and (v.creado_en at time zone 'America/Bogota')::date = d::date
   group by d
   order by d;
end $$;

create or replace function reporte_ventas_por_producto(p_org uuid, p_desde date, p_hasta date, p_limite int default 50)
returns table (producto_id uuid, nombre text, cantidad numeric, ingreso numeric, costo numeric, utilidad numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform reportes_validar(p_org, p_desde, p_hasta);
  return query
  select p.id, p.nombre,
         sum(d.cantidad * coalesce(pr.factor, 1))::numeric,
         sum(d.subtotal)::numeric,
         sum(round(d.cantidad * coalesce(d.costo_unitario, 0), 2))::numeric,
         sum(d.subtotal - round(d.cantidad * coalesce(d.costo_unitario, 0), 2))::numeric
    from ventas v
    join ventas_detalle d on d.venta_id = v.id
    join productos p on p.id = d.producto_id
    left join presentaciones pr on pr.id = d.presentacion_id
   where v.organizacion_id = p_org and v.estado = 'confirmado'
     and (v.creado_en at time zone 'America/Bogota')::date between p_desde and p_hasta
   group by p.id, p.nombre
   order by sum(d.subtotal) desc
   limit least(greatest(p_limite, 1), 500);
end $$;

create or replace function reporte_ventas_por_vendedor(p_org uuid, p_desde date, p_hasta date)
returns table (usuario_id uuid, nombre text, ventas bigint, total numeric, utilidad numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform reportes_validar(p_org, p_desde, p_hasta);
  return query
  select v.usuario_id, coalesce(m.nombre, 'Sin nombre'), count(v.id),
         sum(v.total)::numeric, sum(v.total - v.costo_total)::numeric
    from ventas v
    left join miembros m on m.usuario_id = v.usuario_id and m.organizacion_id = v.organizacion_id
   where v.organizacion_id = p_org and v.estado = 'confirmado'
     and (v.creado_en at time zone 'America/Bogota')::date between p_desde and p_hasta
   group by v.usuario_id, m.nombre
   order by sum(v.total) desc;
end $$;

create or replace function reporte_ventas_por_metodo(p_org uuid, p_desde date, p_hasta date)
returns table (metodo text, pagos bigint, total numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform reportes_validar(p_org, p_desde, p_hasta);
  return query
  select pv.metodo::text, count(pv.id), sum(pv.monto)::numeric
    from ventas v
    join pagos_venta pv on pv.venta_id = v.id
   where v.organizacion_id = p_org and v.estado = 'confirmado'
     and (v.creado_en at time zone 'America/Bogota')::date between p_desde and p_hasta
   group by pv.metodo
   order by sum(pv.monto) desc;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'reportes_validar(uuid,date,date)',
    'reporte_ventas_diarias(uuid,date,date)',
    'reporte_ventas_por_producto(uuid,date,date,int)',
    'reporte_ventas_por_vendedor(uuid,date,date)',
    'reporte_ventas_por_metodo(uuid,date,date)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
