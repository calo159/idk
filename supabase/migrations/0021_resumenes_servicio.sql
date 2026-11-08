-- 0021: resúmenes para n8n (Fase 3: 3.2) — resumen diario y reporte semanal por WhatsApp.
-- Funciones SOLO para service_role (las llama el servidor de Surtix con el token de n8n): no tienen usuario,
-- por eso no verifican rol; el aislamiento lo da el parámetro p_org, que siempre viene del servidor.

create or replace function organizaciones_para_resumen()
returns table (id uuid, nombre text, telefono_whatsapp text)
language sql stable security definer set search_path = public as $$
  select o.id, o.nombre, o.telefono_whatsapp from organizaciones o
   where o.telefono_whatsapp is not null
     and exists (select 1 from ventas v where v.organizacion_id = o.id and v.creado_en > now() - interval '30 days')
   order by o.nombre
$$;

create or replace function resumen_periodo(p_org uuid, p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if p_hasta < p_desde or p_hasta - p_desde > 92 then raise exception 'Rango de fechas inválido'; end if;
  with v as (
    select * from ventas ve
     where ve.organizacion_id = p_org and ve.estado = 'confirmado'
       and (ve.creado_en at time zone 'America/Bogota')::date between p_desde and p_hasta
  ), dv as (
    select coalesce(sum(x.total), 0) as total, coalesce(sum(x.costo_total), 0) as costo
      from devoluciones_cliente x
     where x.organizacion_id = p_org and (x.creado_en at time zone 'America/Bogota')::date between p_desde and p_hasta
  )
  select jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'ventas', (select count(*) from v),
    'total', (select coalesce(sum(total), 0) from v) - (select total from dv),
    'utilidad', (select coalesce(sum(total - costo_total), 0) from v) - (select total - costo from dv),
    'devoluciones', (select total from dv),
    'por_metodo', coalesce((
      select jsonb_agg(jsonb_build_object('metodo', m.metodo, 'total', m.t) order by m.t desc)
        from (select pv.metodo::text as metodo, sum(pv.monto) as t from pagos_venta pv join v on v.id = pv.venta_id group by pv.metodo) m), '[]'::jsonb),
    'top_productos', coalesce((
      select jsonb_agg(jsonb_build_object('nombre', t.nombre, 'cantidad', t.cant, 'ingreso', t.ing) order by t.ing desc)
        from (select p.nombre, sum(d.cantidad * coalesce(pr.factor, 1)) as cant, sum(d.subtotal) as ing
                from ventas_detalle d join v on v.id = d.venta_id join productos p on p.id = d.producto_id
                left join presentaciones pr on pr.id = d.presentacion_id
               group by p.nombre order by sum(d.subtotal) desc limit 3) t), '[]'::jsonb),
    'pagos_sin_verificar', (select count(*) from pagos_venta pv join v on v.id = pv.venta_id where pv.verificacion in ('sin_verificar','sospechoso')
                              or (pv.metodo in ('nequi','daviplata','transferencia') and pv.verificacion = 'no_aplica')),
    'diferencia_caja', (select coalesce(sum(t.diferencia), 0) from turnos_caja t
                         where t.organizacion_id = p_org and t.estado = 'cerrado'
                           and (t.cerrado_en at time zone 'America/Bogota')::date between p_desde and p_hasta),
    'turnos_abiertos', (select count(*) from turnos_caja t where t.organizacion_id = p_org and t.estado = 'abierto'),
    'gastos', (select coalesce(sum(g.monto), 0) from gastos g where g.organizacion_id = p_org and g.estado = 'activo' and g.fecha between p_desde and p_hasta),
    'fiado_nuevo', (select coalesce(sum(pv.monto), 0) from pagos_venta pv join v on v.id = pv.venta_id where pv.metodo = 'credito'),
    'por_cobrar', (select coalesce(sum(c.saldo), 0) from clientes c where c.organizacion_id = p_org and c.saldo > 0),
    'alertas_pendientes', (select count(*) from alertas a where a.organizacion_id = p_org and not a.leida)
  ) into r;
  return r;
end $$;

revoke all on function organizaciones_para_resumen() from public, anon, authenticated;
revoke all on function resumen_periodo(uuid, date, date) from public, anon, authenticated;
grant execute on function organizaciones_para_resumen() to service_role;
grant execute on function resumen_periodo(uuid, date, date) to service_role;
