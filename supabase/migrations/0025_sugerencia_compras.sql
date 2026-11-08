-- 0025: predicción de agotamiento y orden de compra sugerida (Fase 3: 3.6)
-- Ritmo de venta = mezcla del último mes y medio (60 %: últimos 14 días, 40 %: últimos 60), en unidades base y
-- neto de nada más que ventas confirmadas. Con ese ritmo se calcula en cuántos días se acaba cada producto y cuánto
-- comprar para cubrir `cobertura` días más el tiempo que tarda en llegar el pedido (`entrega`).
-- Las temporadas (3.7) ajustarán después este ritmo.

create or replace function calcular_sugerencia(p_org uuid, p_cobertura integer default 14, p_entrega integer default 3)
returns table (producto_id uuid, producto text, unidad text, stock numeric, stock_minimo numeric, venta_diaria numeric,
               dias_restantes numeric, sugerida numeric, urgencia text, proveedor_id uuid, proveedor text, costo_estimado numeric,
               valor_estimado numeric)
language sql stable security definer set search_path = public as $$
  with hoy as (select (now() at time zone 'America/Bogota')::date as d),
  ventas_prod as (
    select dt.producto_id,
           sum(dt.cantidad * coalesce(pr.factor, 1)) filter (where (v.creado_en at time zone 'America/Bogota')::date >= (select d from hoy) - 14) as u14,
           sum(dt.cantidad * coalesce(pr.factor, 1)) as u60
      from ventas v
      join ventas_detalle dt on dt.venta_id = v.id
      left join presentaciones pr on pr.id = dt.presentacion_id
     where v.organizacion_id = p_org and v.estado = 'confirmado'
       and (v.creado_en at time zone 'America/Bogota')::date >= (select d from hoy) - 60
     group by dt.producto_id
  ),
  existencia as (select e.producto_id, sum(e.cantidad) as cant from existencias e where e.organizacion_id = p_org group by e.producto_id),
  precios as (
    select distinct on (pp.producto_id, pp.proveedor_id) pp.producto_id, pp.proveedor_id, pp.costo_unitario_base as costo
      from precios_proveedor pp where pp.organizacion_id = p_org
     order by pp.producto_id, pp.proveedor_id, pp.fecha desc, pp.id desc
  ),
  mejor as (
    select distinct on (producto_id) producto_id, proveedor_id, costo from precios order by producto_id, costo, proveedor_id
  ),
  base as (
    select p.id, p.nombre, p.unidad_base, p.stock_minimo, coalesce(x.cant, 0) as stock,
           round((0.6 * coalesce(v.u14, 0) / 14.0 + 0.4 * coalesce(v.u60, 0) / 60.0)::numeric, 4) as vd
      from productos p
      join ventas_prod v on v.producto_id = p.id
      left join existencia x on x.producto_id = p.id
     where p.organizacion_id = p_org and p.activo and p.maneja_inventario
  ),
  calc as (
    select b.*,
           case when b.vd > 0 then round(greatest(b.stock, 0) / b.vd, 1) end as dias,
           greatest(ceil(greatest(b.vd * (p_cobertura + p_entrega) - b.stock, b.stock_minimo - b.stock, 0)), 0) as sug
      from base b
  )
  select c.id, c.nombre, c.unidad_base, c.stock, c.stock_minimo, c.vd, c.dias, c.sug::numeric,
         case when c.dias is not null and c.dias <= p_entrega then 'critica' else 'pronto' end,
         m.proveedor_id, pr.nombre, m.costo, round(c.sug * coalesce(m.costo, 0), 2)
    from calc c
    left join mejor m on m.producto_id = c.id
    left join proveedores pr on pr.id = m.proveedor_id
   where c.sug > 0 and (c.dias is null or c.dias <= p_cobertura + p_entrega or c.stock <= c.stock_minimo)
   order by (c.dias is not null and c.dias <= p_entrega) desc, c.dias nulls last, c.nombre
$$;
revoke all on function calcular_sugerencia(uuid, integer, integer) from public, anon, authenticated;

create or replace function sugerencia_compras(p_org uuid, p_cobertura integer default 14, p_entrega integer default 3)
returns table (producto_id uuid, producto text, unidad text, stock numeric, stock_minimo numeric, venta_diaria numeric,
               dias_restantes numeric, sugerida numeric, urgencia text, proveedor_id uuid, proveedor text, costo_estimado numeric,
               valor_estimado numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero','contador']::rol_miembro[]) then raise exception 'Sin permiso para ver sugerencias de compra'; end if;
  if p_cobertura is null or p_cobertura < 1 or p_cobertura > 90 then raise exception 'La cobertura debe estar entre 1 y 90 días'; end if;
  if p_entrega is null or p_entrega < 0 or p_entrega > 60 then raise exception 'El tiempo de entrega debe estar entre 0 y 60 días'; end if;
  return query select * from calcular_sugerencia(p_org, p_cobertura, p_entrega);
end $$;
grant execute on function sugerencia_compras(uuid, integer, integer) to authenticated;
revoke all on function sugerencia_compras(uuid, integer, integer) from public, anon;

-- Para n8n (F7, semanal): resumen por negocio con WhatsApp configurado.
create or replace function reposicion_para_resumen()
returns table (organizacion_id uuid, organizacion text, telefono_whatsapp text, criticos integer, total integer, valor numeric, top jsonb)
language sql stable security definer set search_path = public as $$
  select o.id, o.nombre, o.telefono_whatsapp,
         count(*) filter (where s.urgencia = 'critica')::integer, count(*)::integer, coalesce(sum(s.valor_estimado), 0),
         coalesce(jsonb_agg(jsonb_build_object('producto', s.producto, 'sugerida', s.sugerida, 'unidad', s.unidad, 'dias', s.dias_restantes)
                            order by (s.urgencia = 'critica') desc, s.dias_restantes nulls last) filter (where true), '[]'::jsonb)
    from organizaciones o
    cross join lateral calcular_sugerencia(o.id) s
   where o.telefono_whatsapp is not null
   group by o.id, o.nombre, o.telefono_whatsapp
$$;
revoke all on function reposicion_para_resumen() from public, anon, authenticated;
grant execute on function reposicion_para_resumen() to service_role;
