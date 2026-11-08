-- 0028: promociones para mover la plata dormida (Fase 3: 3.9)
-- Sugiere un descuento por producto según cuánto lleva sin venderse (10 % desde 60 días, 20 % desde 90, 30 % desde 180),
-- SIN bajar nunca del costo del producto. Una promoción tiene vigencia; el POS cobra el precio promocional mientras esté activa.

create table promociones (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  nombre text not null,
  desde date not null,
  hasta date not null check (hasta >= desde),
  activa boolean not null default true,
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create table promociones_productos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  promocion_id uuid not null references promociones(id) on delete cascade,
  producto_id uuid not null references productos(id),
  precio_normal numeric(14,2) not null,
  precio_promocional numeric(14,2) not null check (precio_promocional > 0),
  unique (promocion_id, producto_id)
);
alter table promociones enable row level security;
alter table promociones_productos enable row level security;
create policy promociones_leer on promociones for select using (organizacion_id in (select mis_organizaciones()));
create policy promociones_productos_leer on promociones_productos for select using (organizacion_id in (select mis_organizaciones()));
create trigger trg_misma_org before insert or update on promociones_productos
  for each row execute function exigir_misma_organizacion('promocion_id:promociones', 'producto_id:productos');

create or replace function sugerir_promociones(p_org uuid, p_dias integer default 60)
returns table (producto_id uuid, producto text, cantidad numeric, costo numeric, precio_normal numeric, dias_sin_vender integer,
               descuento_pct numeric, precio_sugerido numeric, valor_inmovilizado numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','contador']::rol_miembro[]) then raise exception 'Sin permiso para ver promociones sugeridas'; end if;
  if p_dias is null or p_dias < 30 or p_dias > 730 then raise exception 'Los días deben estar entre 30 y 730'; end if;
  return query
  with dormida as (select * from reporte_plata_dormida_interno(p_org, p_dias)),
  calc as (
    select d.producto_id, d.nombre, d.cantidad, p.precio_venta as pn,
           case when d.cantidad > 0 then d.valor / d.cantidad else 0 end as costo,
           coalesce(d.dias_sin_vender, 9999) as dias, d.valor
      from dormida d join productos p on p.id = d.producto_id
     where p.precio_venta > 0
  ), tier as (
    select c.*, case when c.dias >= 180 then 30 when c.dias >= 90 then 20 else 10 end as pct from calc c
  )
  select t.producto_id, t.nombre, t.cantidad, round(t.costo, 2), t.pn, case when t.dias = 9999 then null else t.dias end,
         -- el descuento nunca deja el precio por debajo del costo
         round(least(t.pct, greatest(0, (t.pn - t.costo) / t.pn * 100)), 1),
         greatest(redondeo_precio(t.pn * (1 - least(t.pct, greatest(0, (t.pn - t.costo) / t.pn * 100)) / 100)), t.costo)::numeric,
         round(t.valor, 2)
    from tier t
   where t.pn > t.costo
   order by t.valor desc;
end $$;
revoke all on function sugerir_promociones(uuid, integer) from public, anon;
grant execute on function sugerir_promociones(uuid, integer) to authenticated;

-- Versión interna de plata dormida (sin chequeo de rol; la usa sugerir_promociones, que sí lo hace).
create or replace function reporte_plata_dormida_interno(p_org uuid, p_dias integer)
returns table (producto_id uuid, nombre text, cantidad numeric, valor numeric, ultima_venta date, dias_sin_vender integer)
language sql stable security definer set search_path = public as $$
  select p.id, p.nombre, st.cant::numeric, st.valor::numeric, uv.ultima,
         case when uv.ultima is null then null else ((now() at time zone 'America/Bogota')::date - uv.ultima) end
    from productos p
    join (select ex.producto_id, sum(ex.cantidad) cant, round(sum(ex.cantidad * ex.costo_promedio), 2) valor
            from existencias ex where ex.organizacion_id = p_org group by ex.producto_id having sum(ex.cantidad) > 0) st on st.producto_id = p.id
    left join (select d.producto_id, max((v.creado_en at time zone 'America/Bogota')::date) as ultima
                 from ventas v join ventas_detalle d on d.venta_id = v.id
                where v.organizacion_id = p_org and v.estado = 'confirmado' group by d.producto_id) uv on uv.producto_id = p.id
   where p.organizacion_id = p_org and p.activo and p.maneja_inventario
     and (uv.ultima is null or uv.ultima < (now() at time zone 'America/Bogota')::date - p_dias)
$$;
revoke all on function reporte_plata_dormida_interno(uuid, integer) from public, anon, authenticated;

-- items: [{producto_id, precio}]. Rechaza precios iguales o mayores al normal y precios bajo el costo.
create or replace function crear_promocion(p_org uuid, p_nombre text, p_desde date, p_hasta date, p_items jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare it jsonb; pid uuid; precio numeric; normal numeric; costo numeric; nuevo uuid;
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin crean promociones'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'La promoción necesita un nombre'; end if;
  if p_hasta < p_desde then raise exception 'La fecha final no puede ser anterior a la inicial'; end if;
  if p_hasta - p_desde > 120 then raise exception 'Una promoción dura máximo 120 días'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Elige al menos un producto'; end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'Máximo 200 productos por promoción'; end if;
  insert into promociones (organizacion_id, nombre, desde, hasta, usuario_id) values (p_org, trim(p_nombre), p_desde, p_hasta, auth.uid()) returning id into nuevo;
  for it in select * from jsonb_array_elements(p_items) loop
    pid := (it->>'producto_id')::uuid;
    precio := (it->>'precio')::numeric;
    select precio_venta into normal from productos where id = pid and organizacion_id = p_org;
    if not found then raise exception 'Producto no existe'; end if;
    select coalesce(sum(cantidad * costo_promedio) / nullif(sum(cantidad), 0), 0) into costo from existencias where producto_id = pid and cantidad > 0;
    if precio is null or precio <= 0 or precio >= normal then raise exception 'El precio promocional debe ser menor al precio normal'; end if;
    if precio < costo then raise exception 'La promoción dejaría un producto por debajo de su costo'; end if;
    insert into promociones_productos (organizacion_id, promocion_id, producto_id, precio_normal, precio_promocional)
    values (p_org, nuevo, pid, normal, precio);
  end loop;
  return nuevo;
end $$;

create or replace function desactivar_promocion(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  select organizacion_id into org from promociones where id = p_id;
  if org is null or org not in (select mis_organizaciones()) then raise exception 'Promoción no existe'; end if;
  if not tiene_rol(org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin'; end if;
  update promociones set activa = false where id = p_id;
end $$;

-- Para el POS: precio promocional vigente hoy de cada producto (si hay varias, el más bajo).
create or replace function promociones_vigentes(p_org uuid)
returns table (producto_id uuid, precio numeric, promocion text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_org not in (select mis_organizaciones()) then raise exception 'Sin acceso'; end if;
  return query
  select distinct on (pp.producto_id) pp.producto_id, pp.precio_promocional, pr.nombre
    from promociones_productos pp join promociones pr on pr.id = pp.promocion_id
   where pp.organizacion_id = p_org and pr.activa and (now() at time zone 'America/Bogota')::date between pr.desde and pr.hasta
   order by pp.producto_id, pp.precio_promocional;
end $$;

do $$
declare f text;
begin
  foreach f in array array['crear_promocion(uuid,text,date,date,jsonb)', 'desactivar_promocion(uuid)', 'promociones_vigentes(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
