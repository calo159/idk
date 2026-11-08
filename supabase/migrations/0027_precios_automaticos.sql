-- 0027: precios automáticos y simulador (Fase 3: 3.8)
-- Cada producto puede tener un margen objetivo (sobre el precio de venta). El precio sugerido sale del costo promedio:
--   precio = costo / (1 − margen), redondeado hacia ARRIBA a $ 100 ($ 50 si es menor a $ 1.000).
-- Todo cambio de precio queda en `historial_precios`. El negocio puede activar la actualización automática
-- (opt-in): al confirmar compras, los precios se ajustan solos, con tope de ±15 % por vez para evitar saltos.

alter table organizaciones add column if not exists precios_automaticos boolean not null default false;

create table historial_precios (
  id bigint generated always as identity primary key,
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  producto_id uuid not null references productos(id),
  precio_anterior numeric(14,2) not null,
  precio_nuevo numeric(14,2) not null,
  motivo text not null,
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index on historial_precios (organizacion_id, producto_id, creado_en desc);
alter table historial_precios enable row level security;
create policy historial_precios_leer on historial_precios for select
  using (tiene_rol(organizacion_id, array['dueno','admin','contador']::rol_miembro[]));

create or replace function redondeo_precio(n numeric) returns numeric
language sql immutable as $$
  select case when n < 1000 then ceil(n / 50) * 50 else ceil(n / 100) * 100 end
$$;

-- Costo de reposición de cada producto: costo promedio ponderado del stock; si no hay stock, el último costo de compra.
create or replace function calcular_precios_sugeridos(p_org uuid)
returns table (producto_id uuid, producto text, categoria text, costo numeric, precio_actual numeric, margen_objetivo numeric,
               margen_actual numeric, precio_sugerido numeric, cambio_pct numeric, unidades_30d numeric)
language sql stable security definer set search_path = public as $$
  with costo as (
    select p.id as pid,
           coalesce(
             (select sum(e.cantidad * e.costo_promedio) / nullif(sum(e.cantidad), 0) from existencias e where e.producto_id = p.id and e.cantidad > 0 and e.costo_promedio > 0),
             (select pp.costo_unitario_base from precios_proveedor pp where pp.producto_id = p.id order by pp.fecha desc, pp.id desc limit 1)
           ) as c
      from productos p where p.organizacion_id = p_org
  ),
  ventas30 as (
    select d.producto_id, sum(d.cantidad * coalesce(pr.factor, 1)) as u
      from ventas v join ventas_detalle d on d.venta_id = v.id left join presentaciones pr on pr.id = d.presentacion_id
     where v.organizacion_id = p_org and v.estado = 'confirmado' and v.creado_en > now() - interval '30 days'
     group by d.producto_id
  )
  select p.id, p.nombre, coalesce(ca.nombre, 'Sin categoría'), round(co.c, 2), p.precio_venta, p.margen_objetivo,
         case when p.precio_venta > 0 and co.c is not null then round((p.precio_venta - co.c) / p.precio_venta * 100, 1) end,
         redondeo_precio(co.c / (1 - p.margen_objetivo / 100)),
         case when p.precio_venta > 0 then round((redondeo_precio(co.c / (1 - p.margen_objetivo / 100)) - p.precio_venta) / p.precio_venta * 100, 1) end,
         coalesce(v.u, 0)
    from productos p
    join costo co on co.pid = p.id and co.c is not null and co.c > 0
    left join categorias ca on ca.id = p.categoria_id
    left join ventas30 v on v.producto_id = p.id
   where p.organizacion_id = p_org and p.activo and p.margen_objetivo is not null and p.margen_objetivo > 0 and p.margen_objetivo < 95
   order by abs(redondeo_precio(co.c / (1 - p.margen_objetivo / 100)) - p.precio_venta) / nullif(p.precio_venta, 0) desc nulls last, p.nombre
$$;
revoke all on function calcular_precios_sugeridos(uuid) from public, anon, authenticated;

create or replace function precios_sugeridos(p_org uuid)
returns table (producto_id uuid, producto text, categoria text, costo numeric, precio_actual numeric, margen_objetivo numeric,
               margen_actual numeric, precio_sugerido numeric, cambio_pct numeric, unidades_30d numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','contador']::rol_miembro[]) then raise exception 'Sin permiso para ver precios sugeridos'; end if;
  return query select * from calcular_precios_sugeridos(p_org);
end $$;

-- Aplica precios elegidos a mano. [{producto_id, precio}]
create or replace function aplicar_precios(p_org uuid, p_items jsonb, p_motivo text default 'Ajuste por margen objetivo') returns integer
language plpgsql security definer set search_path = public as $$
declare it jsonb; pid uuid; nuevo numeric; actual numeric; n int := 0;
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin cambian precios'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Elige al menos un producto'; end if;
  if jsonb_array_length(p_items) > 500 then raise exception 'Máximo 500 productos por vez'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    pid := (it->>'producto_id')::uuid;
    nuevo := (it->>'precio')::numeric;
    select precio_venta into actual from productos where id = pid and organizacion_id = p_org for update;
    if not found then raise exception 'Producto no existe'; end if;
    if nuevo is null or nuevo <= 0 or nuevo > 999999999 then raise exception 'Precio inválido'; end if;
    if actual > 0 and (nuevo > actual * 5 or nuevo < actual / 5) then raise exception 'Cambio de precio demasiado grande (más de 5 veces): revísalo'; end if;
    if nuevo = actual then continue; end if;
    update productos set precio_venta = nuevo where id = pid;
    insert into historial_precios (organizacion_id, producto_id, precio_anterior, precio_nuevo, motivo, usuario_id)
    values (p_org, pid, actual, nuevo, left(coalesce(p_motivo, 'Ajuste'), 120), auth.uid());
    n := n + 1;
  end loop;
  if n > 0 then
    insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
    values (p_org, 'productos', p_org::text, 'cambio_precios', jsonb_build_object('productos', n, 'motivo', p_motivo), auth.uid());
  end if;
  return n;
end $$;

-- Opt-in: ajusta solo los precios cuyo desfase pasa de 2 %, con tope de ±15 % por vez.
create or replace function actualizar_precios_automaticos(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare s record; nuevo numeric; tope_alto numeric; tope_bajo numeric; n int := 0; activo boolean;
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero']::rol_miembro[]) then raise exception 'Sin permiso'; end if;
  select precios_automaticos into activo from organizaciones where id = p_org;
  if not coalesce(activo, false) then return 0; end if;
  for s in select * from calcular_precios_sugeridos(p_org) where abs(cambio_pct) >= 2 loop
    tope_alto := redondeo_precio(s.precio_actual * 1.15);
    tope_bajo := greatest(redondeo_precio(s.precio_actual * 0.85), 50);
    nuevo := least(greatest(s.precio_sugerido, tope_bajo), tope_alto);
    if nuevo = s.precio_actual or nuevo <= 0 then continue; end if;
    update productos set precio_venta = nuevo where id = s.producto_id;
    insert into historial_precios (organizacion_id, producto_id, precio_anterior, precio_nuevo, motivo, usuario_id)
    values (p_org, s.producto_id, s.precio_actual, nuevo, 'Automático por margen objetivo', auth.uid());
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function configurar_precios_automaticos(p_org uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin'; end if;
  update organizaciones set precios_automaticos = p_activo where id = p_org;
end $$;

do $$
declare f text;
begin
  foreach f in array array['precios_sugeridos(uuid)', 'aplicar_precios(uuid,jsonb,text)', 'actualizar_precios_automaticos(uuid)', 'configurar_precios_automaticos(uuid,boolean)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
