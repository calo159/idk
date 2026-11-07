-- 0012: reportes de inventario (Fase 2: 2.9) — valorizado, ABC, rotación y plata dormida.
-- Mismas reglas que 0010: rol dueño/admin/contador, solo ventas confirmadas, días de Bogotá.

create or replace function reporte_inventario_valorizado(p_org uuid)
returns table (producto_id uuid, nombre text, categoria text, cantidad numeric, costo_promedio numeric, valor numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','contador']::rol_miembro[]) then
    raise exception 'Sin permiso para ver reportes';
  end if;
  return query
  select p.id, p.nombre, coalesce(c.nombre, 'Sin categoría'),
         sum(e.cantidad)::numeric,
         case when sum(e.cantidad) > 0 then (sum(e.cantidad * e.costo_promedio) / sum(e.cantidad))::numeric(14,2) else 0 end,
         round(sum(e.cantidad * e.costo_promedio), 2)::numeric
    from existencias e
    join productos p on p.id = e.producto_id
    left join categorias c on c.id = p.categoria_id
   where e.organizacion_id = p_org and e.cantidad > 0
   group by p.id, p.nombre, c.nombre
   order by sum(e.cantidad * e.costo_promedio) desc;
end $$;

-- Clasificación ABC por ingreso: A = productos que suman el 80 % de las ventas, B hasta el 95 %, C el resto.
create or replace function reporte_abc(p_org uuid, p_desde date, p_hasta date)
returns table (producto_id uuid, nombre text, ingreso numeric, participacion numeric, acumulado numeric, clase text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform reportes_validar(p_org, p_desde, p_hasta);
  return query
  with base as (
    select p.id, p.nombre, sum(d.subtotal) as ing
      from ventas v
      join ventas_detalle d on d.venta_id = v.id
      join productos p on p.id = d.producto_id
     where v.organizacion_id = p_org and v.estado = 'confirmado'
       and (v.creado_en at time zone 'America/Bogota')::date between p_desde and p_hasta
     group by p.id, p.nombre
  ), tot as (select nullif(sum(ing), 0) as t from base),
  acum as (
    select b.id, b.nombre, b.ing,
           round(b.ing / tot.t * 100, 2) as part,
           round(sum(b.ing) over (order by b.ing desc, b.nombre rows between unbounded preceding and current row) / tot.t * 100, 2) as ac,
           round((sum(b.ing) over (order by b.ing desc, b.nombre rows between unbounded preceding and current row) - b.ing) / tot.t * 100, 2) as ac_previo
      from base b cross join tot
  )
  select a.id, a.nombre, a.ing::numeric, a.part::numeric, a.ac::numeric,
         case when a.ac_previo < 80 then 'A' when a.ac_previo < 95 then 'B' else 'C' end
    from acum a order by a.ing desc, a.nombre;
end $$;

-- Rotación: unidades vendidas, stock actual, ventas por día y días de inventario que alcanzan.
create or replace function reporte_rotacion(p_org uuid, p_desde date, p_hasta date)
returns table (producto_id uuid, nombre text, vendido numeric, stock numeric, venta_diaria numeric, dias_de_inventario numeric)
language plpgsql stable security definer set search_path = public as $$
declare dias int;
begin
  perform reportes_validar(p_org, p_desde, p_hasta);
  dias := (p_hasta - p_desde) + 1;
  return query
  select p.id, p.nombre,
         coalesce(v.vendido, 0)::numeric,
         coalesce(s.stock, 0)::numeric,
         round(coalesce(v.vendido, 0) / dias, 3)::numeric,
         case when coalesce(v.vendido, 0) > 0 then round(coalesce(s.stock, 0) / (v.vendido / dias), 1)::numeric end
    from productos p
    left join (
      select d.producto_id, sum(d.cantidad * coalesce(pr.factor, 1)) as vendido
        from ventas vt
        join ventas_detalle d on d.venta_id = vt.id
        left join presentaciones pr on pr.id = d.presentacion_id
       where vt.organizacion_id = p_org and vt.estado = 'confirmado'
         and (vt.creado_en at time zone 'America/Bogota')::date between p_desde and p_hasta
       group by d.producto_id) v on v.producto_id = p.id
    left join (select ex.producto_id, sum(ex.cantidad) as stock from existencias ex where ex.organizacion_id = p_org group by ex.producto_id) s
           on s.producto_id = p.id
   where p.organizacion_id = p_org and p.activo and p.maneja_inventario
     and (coalesce(v.vendido, 0) > 0 or coalesce(s.stock, 0) > 0)
   order by (case when coalesce(v.vendido, 0) > 0 then coalesce(s.stock, 0) / v.vendido end) nulls last, p.nombre;
end $$;

-- Plata dormida: stock con valor que no se vende hace N días (o nunca).
create or replace function reporte_plata_dormida(p_org uuid, p_dias int default 60)
returns table (producto_id uuid, nombre text, cantidad numeric, valor numeric, ultima_venta date, dias_sin_vender int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','contador']::rol_miembro[]) then
    raise exception 'Sin permiso para ver reportes';
  end if;
  if p_dias is null or p_dias < 7 or p_dias > 730 then raise exception 'Los días deben estar entre 7 y 730'; end if;
  return query
  select p.id, p.nombre, st.cant::numeric, st.valor::numeric, uv.ultima,
         case when uv.ultima is null then null else ((now() at time zone 'America/Bogota')::date - uv.ultima) end
    from productos p
    join (select ex.producto_id, sum(ex.cantidad) cant, round(sum(ex.cantidad * ex.costo_promedio), 2) valor
            from existencias ex where ex.organizacion_id = p_org group by ex.producto_id having sum(ex.cantidad) > 0) st
      on st.producto_id = p.id
    left join (
      select d.producto_id, max((v.creado_en at time zone 'America/Bogota')::date) as ultima
        from ventas v join ventas_detalle d on d.venta_id = v.id
       where v.organizacion_id = p_org and v.estado = 'confirmado'
       group by d.producto_id) uv on uv.producto_id = p.id
   where p.organizacion_id = p_org and p.activo and p.maneja_inventario
     and (uv.ultima is null or uv.ultima < (now() at time zone 'America/Bogota')::date - p_dias)
   order by st.valor desc;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'reporte_inventario_valorizado(uuid)',
    'reporte_abc(uuid,date,date)',
    'reporte_rotacion(uuid,date,date)',
    'reporte_plata_dormida(uuid,int)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
