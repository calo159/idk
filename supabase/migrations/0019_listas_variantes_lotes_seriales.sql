-- 0019: listas de precios, variantes, lotes con vencimiento y seriales (Fase 2: 2.5)
--
--  * Listas de precios: precios distintos por tipo de cliente (mayorista, constructor…). El POS usa la lista del cliente.
--  * Variantes: talla/color como productos hijos (cada uno con su stock, código y precio) agrupados bajo un producto base.
--  * Lotes: se registran al recibir mercancía. El saldo de cada lote se DERIVA del stock real asumiendo que se vende
--    primero lo que vence primero (FEFO): no hay un segundo inventario que pueda descuadrarse.
--  * Seriales: cada unidad con número de serie, su historial y su garantía.

-- ---------------------------------------------------------------------
-- Listas de precios
-- ---------------------------------------------------------------------
create table listas_precios (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  nombre text not null,
  descripcion text,
  activa boolean not null default true,
  unique (organizacion_id, nombre)
);
create table precios_lista (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  lista_id uuid not null references listas_precios(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete cascade,
  presentacion_id uuid references presentaciones(id) on delete cascade,
  precio numeric(14,2) not null check (precio >= 0)
);
create unique index precios_lista_unico on precios_lista (lista_id, producto_id, coalesce(presentacion_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table clientes add column if not exists lista_precios_id uuid references listas_precios(id);

-- ---------------------------------------------------------------------
-- Variantes, garantía
-- ---------------------------------------------------------------------
alter table productos
  add column if not exists variante_de uuid references productos(id),
  add column if not exists atributos jsonb,
  add column if not exists maneja_lotes boolean not null default false,
  add column if not exists maneja_seriales boolean not null default false,
  add column if not exists garantia_dias integer check (garantia_dias is null or garantia_dias between 0 and 3650);
create index if not exists productos_variante_idx on productos (variante_de) where variante_de is not null;

-- ---------------------------------------------------------------------
-- Lotes
-- ---------------------------------------------------------------------
create table lotes (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  producto_id uuid not null references productos(id),
  bodega_id uuid not null references bodegas(id),
  codigo text not null,
  vence date,
  cantidad numeric(14,3) not null check (cantidad > 0),
  compra_id uuid references compras(id),
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index on lotes (organizacion_id, producto_id, bodega_id);

-- ---------------------------------------------------------------------
-- Seriales
-- ---------------------------------------------------------------------
create table seriales (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  producto_id uuid not null references productos(id),
  bodega_id uuid not null references bodegas(id),
  serial text not null check (length(trim(serial)) >= 3),
  estado text not null default 'en_stock' check (estado in ('en_stock','vendido','devuelto')),
  compra_id uuid references compras(id),
  venta_id uuid references ventas(id),
  vendido_en timestamptz,
  garantia_hasta date,
  creado_en timestamptz not null default now(),
  unique (organizacion_id, serial)
);
create index on seriales (organizacion_id, producto_id, estado);

do $$
declare t text;
begin
  foreach t in array array['listas_precios','precios_lista','lotes','seriales'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (organizacion_id in (select mis_organizaciones()))', t || '_leer', t);
  end loop;
end $$;

create trigger trg_misma_org before insert or update on precios_lista
  for each row execute function exigir_misma_organizacion('lista_id:listas_precios', 'producto_id:productos', 'presentacion_id:presentaciones');
create trigger trg_misma_org before insert or update on lotes
  for each row execute function exigir_misma_organizacion('producto_id:productos', 'bodega_id:bodegas', 'compra_id:compras');
create trigger trg_misma_org before insert or update on seriales
  for each row execute function exigir_misma_organizacion('producto_id:productos', 'bodega_id:bodegas', 'compra_id:compras', 'venta_id:ventas');
create trigger trg_misma_org_cli_lista before insert or update of lista_precios_id on clientes
  for each row execute function exigir_misma_organizacion('lista_precios_id:listas_precios');
create trigger trg_misma_org_variante before insert or update of variante_de on productos
  for each row execute function exigir_misma_organizacion('variante_de:productos');

-- ---------------------------------------------------------------------
-- Funciones: listas de precios
-- ---------------------------------------------------------------------
create or replace function crear_lista_precios(p_org uuid, p_nombre text, p_descripcion text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare nuevo uuid;
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin crean listas de precios'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'La lista necesita un nombre'; end if;
  insert into listas_precios (organizacion_id, nombre, descripcion) values (p_org, trim(p_nombre), nullif(trim(p_descripcion), ''))
  returning id into nuevo;
  return nuevo;
end $$;

create or replace function fijar_precio_lista(p_lista uuid, p_producto uuid, p_precio numeric, p_presentacion uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare l listas_precios%rowtype;
begin
  select * into l from listas_precios where id = p_lista;
  if not found or l.organizacion_id not in (select mis_organizaciones()) then raise exception 'Lista no existe'; end if;
  if not tiene_rol(l.organizacion_id, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin cambian precios'; end if;
  if p_precio is null or p_precio < 0 then raise exception 'El precio no puede ser negativo'; end if;
  if not exists (select 1 from productos where id = p_producto and organizacion_id = l.organizacion_id) then raise exception 'Producto no existe'; end if;
  insert into precios_lista (organizacion_id, lista_id, producto_id, presentacion_id, precio)
  values (l.organizacion_id, p_lista, p_producto, p_presentacion, p_precio)
  on conflict (lista_id, producto_id, coalesce(presentacion_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set precio = excluded.precio;
end $$;

create or replace function asignar_lista_cliente(p_cliente uuid, p_lista uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c clientes%rowtype;
begin
  select * into c from clientes where id = p_cliente;
  if not found or c.organizacion_id not in (select mis_organizaciones()) then raise exception 'Cliente no existe'; end if;
  if not tiene_rol(c.organizacion_id, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin asignan listas de precios'; end if;
  if p_lista is not null and not exists (select 1 from listas_precios where id = p_lista and organizacion_id = c.organizacion_id and activa) then
    raise exception 'Lista no existe o está inactiva';
  end if;
  perform set_config('surtix.desde_funcion', 'si', true);
  update clientes set lista_precios_id = p_lista where id = c.id;
  perform set_config('surtix.desde_funcion', 'no', true);
end $$;

-- ---------------------------------------------------------------------
-- Funciones: variantes
-- ---------------------------------------------------------------------
-- p_combinaciones: [{"atributos": {"talla":"M","color":"Rojo"}, "codigo_barras": null}]
create or replace function crear_variantes(p_base uuid, p_combinaciones jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare b productos%rowtype; c jsonb; etiqueta text; n int := 0; nuevo_id uuid;
begin
  select * into b from productos where id = p_base;
  if not found or b.organizacion_id not in (select mis_organizaciones()) then raise exception 'Producto no existe'; end if;
  if not tiene_rol(b.organizacion_id, array['dueno','admin','bodeguero']::rol_miembro[]) then raise exception 'Sin permiso para crear variantes'; end if;
  if b.variante_de is not null then raise exception 'Una variante no puede tener variantes'; end if;
  if jsonb_typeof(p_combinaciones) <> 'array' or jsonb_array_length(p_combinaciones) = 0 then raise exception 'Indica al menos una variante'; end if;
  if jsonb_array_length(p_combinaciones) > 100 then raise exception 'Máximo 100 variantes por vez'; end if;

  for c in select * from jsonb_array_elements(p_combinaciones) loop
    if jsonb_typeof(c->'atributos') <> 'object' or c->'atributos' = '{}'::jsonb then raise exception 'Cada variante necesita atributos (talla, color…)'; end if;
    select string_agg(value, ' / ' order by key) into etiqueta from jsonb_each_text(c->'atributos') where trim(value) <> '';
    if etiqueta is null then raise exception 'Los atributos no pueden estar vacíos'; end if;
    if exists (select 1 from productos where variante_de = b.id and atributos = c->'atributos') then continue; end if;
    insert into productos (organizacion_id, categoria_id, nombre, descripcion, unidad_base, precio_venta, margen_objetivo,
                           stock_minimo, maneja_inventario, variante_de, atributos, codigo_barras, garantia_dias)
    values (b.organizacion_id, b.categoria_id, b.nombre || ' — ' || etiqueta, b.descripcion, b.unidad_base, b.precio_venta,
            b.margen_objetivo, b.stock_minimo, b.maneja_inventario, b.id, c->'atributos', nullif(c->>'codigo_barras', ''), b.garantia_dias)
    returning id into nuevo_id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Funciones: lotes
-- ---------------------------------------------------------------------
create or replace function registrar_lote(p_org uuid, p_producto uuid, p_bodega uuid, p_codigo text, p_vence date, p_cantidad numeric,
  p_compra uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare nuevo uuid;
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero']::rol_miembro[]) then raise exception 'Sin permiso para registrar lotes'; end if;
  if coalesce(trim(p_codigo), '') = '' then raise exception 'El lote necesita un código'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad del lote debe ser mayor a cero'; end if;
  if not exists (select 1 from productos where id = p_producto and organizacion_id = p_org) then raise exception 'Producto no existe'; end if;
  if not exists (select 1 from bodegas where id = p_bodega and organizacion_id = p_org) then raise exception 'Bodega no existe'; end if;
  insert into lotes (organizacion_id, producto_id, bodega_id, codigo, vence, cantidad, compra_id, usuario_id)
  values (p_org, p_producto, p_bodega, trim(p_codigo), p_vence, p_cantidad, p_compra, auth.uid()) returning id into nuevo;
  perform set_config('surtix.desde_funcion', 'si', true);
  update productos set maneja_lotes = true where id = p_producto and not maneja_lotes;
  perform set_config('surtix.desde_funcion', 'no', true);
  return nuevo;
end $$;

-- Saldo de cada lote: el stock real se reparte empezando por los lotes que vencen más tarde
-- (lo que vence primero se vende primero, así que lo que queda en la repisa es lo más nuevo).
create or replace function lotes_con_saldo(p_org uuid, p_producto uuid default null, p_bodega uuid default null)
returns table (lote_id uuid, producto_id uuid, producto text, bodega_id uuid, codigo text, vence date, cantidad_recibida numeric,
               saldo numeric, dias_para_vencer integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_org not in (select mis_organizaciones()) then raise exception 'Sin acceso'; end if;
  return query
  with lt as (
    select l.*, coalesce(e.cantidad, 0) as stock,
           coalesce(sum(l.cantidad) over (partition by l.producto_id, l.bodega_id order by l.vence desc nulls first, l.creado_en desc, l.id
                                           rows between unbounded preceding and 1 preceding), 0) as acumulado_previo
      from lotes l
      left join existencias e on e.producto_id = l.producto_id and e.bodega_id = l.bodega_id
     where l.organizacion_id = p_org and (p_producto is null or l.producto_id = p_producto) and (p_bodega is null or l.bodega_id = p_bodega)
  )
  select lt.id, lt.producto_id, p.nombre, lt.bodega_id, lt.codigo, lt.vence, lt.cantidad,
         greatest(least(lt.cantidad, lt.stock - lt.acumulado_previo), 0)::numeric(14,3),
         case when lt.vence is null then null else (lt.vence - (now() at time zone 'America/Bogota')::date) end
    from lt join productos p on p.id = lt.producto_id
   order by lt.vence nulls last, lt.creado_en;
end $$;

create or replace function vencimientos_proximos(p_org uuid, p_dias integer default 30)
returns table (lote_id uuid, producto text, bodega_id uuid, codigo text, vence date, saldo numeric, dias_para_vencer integer, valor_en_riesgo numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero','contador']::rol_miembro[]) then raise exception 'Sin permiso para ver vencimientos'; end if;
  if p_dias is null or p_dias < 1 or p_dias > 730 then raise exception 'Los días deben estar entre 1 y 730'; end if;
  return query
  select s.lote_id, s.producto, s.bodega_id, s.codigo, s.vence, s.saldo, s.dias_para_vencer,
         round(s.saldo * coalesce((select e.costo_promedio from existencias e where e.producto_id = s.producto_id and e.bodega_id = s.bodega_id), 0), 2)::numeric
    from lotes_con_saldo(p_org) s
   where s.vence is not null and s.saldo > 0 and s.dias_para_vencer <= p_dias
   order by s.vence, s.producto;
end $$;

-- ---------------------------------------------------------------------
-- Funciones: seriales
-- ---------------------------------------------------------------------
create or replace function registrar_seriales(p_org uuid, p_producto uuid, p_bodega uuid, p_seriales text[], p_compra uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare s text; n int := 0;
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero']::rol_miembro[]) then raise exception 'Sin permiso para registrar seriales'; end if;
  if not exists (select 1 from productos where id = p_producto and organizacion_id = p_org) then raise exception 'Producto no existe'; end if;
  if not exists (select 1 from bodegas where id = p_bodega and organizacion_id = p_org) then raise exception 'Bodega no existe'; end if;
  if p_seriales is null or array_length(p_seriales, 1) is null then raise exception 'Indica al menos un serial'; end if;
  if array_length(p_seriales, 1) > 500 then raise exception 'Máximo 500 seriales por vez'; end if;
  foreach s in array p_seriales loop
    s := upper(trim(s));
    if length(s) < 3 then raise exception 'El serial "%" es muy corto', s; end if;
    insert into seriales (organizacion_id, producto_id, bodega_id, serial, compra_id) values (p_org, p_producto, p_bodega, s, p_compra);
    n := n + 1;
  end loop;
  perform set_config('surtix.desde_funcion', 'si', true);
  update productos set maneja_seriales = true where id = p_producto and not maneja_seriales;
  perform set_config('surtix.desde_funcion', 'no', true);
  return n;
exception when unique_violation then
  raise exception 'Hay un serial repetido: ya está registrado en tu negocio';
end $$;

-- Asocia un serial a una venta confirmada. Calcula la garantía con los días del producto.
create or replace function vender_serial(p_venta uuid, p_serial text) returns date
language plpgsql security definer set search_path = public as $$
declare v ventas%rowtype; s seriales%rowtype; dias int; hasta date;
begin
  select * into v from ventas where id = p_venta;
  if not found or v.organizacion_id not in (select mis_organizaciones()) then raise exception 'Venta no existe'; end if;
  if not tiene_rol(v.organizacion_id, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then raise exception 'Sin permiso'; end if;
  if v.estado <> 'confirmado' then raise exception 'La venta debe estar confirmada'; end if;
  select * into s from seriales where organizacion_id = v.organizacion_id and serial = upper(trim(p_serial)) for update;
  if not found then raise exception 'Ese serial no está registrado'; end if;
  if s.estado = 'vendido' then raise exception 'Ese serial ya se vendió'; end if;
  if s.bodega_id <> v.bodega_id then raise exception 'Ese serial está en otra bodega'; end if;
  if not exists (select 1 from ventas_detalle where venta_id = v.id and producto_id = s.producto_id) then
    raise exception 'La venta no incluye ese producto';
  end if;
  select garantia_dias into dias from productos where id = s.producto_id;
  hasta := case when dias is null then null else (v.creado_en at time zone 'America/Bogota')::date + dias end;
  update seriales set estado = 'vendido', venta_id = v.id, vendido_en = v.creado_en, garantia_hasta = hasta where id = s.id;
  return hasta;
end $$;

-- Historia de un serial: de dónde vino, a quién se vendió y si sigue en garantía.
create or replace function consultar_serial(p_org uuid, p_serial text)
returns table (producto text, estado text, bodega text, comprado date, proveedor text, vendido date, cliente text, venta_numero bigint,
               garantia_hasta date, en_garantia boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_org not in (select mis_organizaciones()) then raise exception 'Sin acceso'; end if;
  return query
  select p.nombre, s.estado, b.nombre, c.fecha, pr.nombre, (s.vendido_en at time zone 'America/Bogota')::date, cl.nombre, v.numero,
         s.garantia_hasta, coalesce(s.garantia_hasta >= (now() at time zone 'America/Bogota')::date, false)
    from seriales s
    join productos p on p.id = s.producto_id
    join bodegas b on b.id = s.bodega_id
    left join compras c on c.id = s.compra_id
    left join proveedores pr on pr.id = c.proveedor_id
    left join ventas v on v.id = s.venta_id
    left join clientes cl on cl.id = v.cliente_id
   where s.organizacion_id = p_org and s.serial = upper(trim(p_serial));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'crear_lista_precios(uuid,text,text)', 'fijar_precio_lista(uuid,uuid,numeric,uuid)', 'asignar_lista_cliente(uuid,uuid)',
    'crear_variantes(uuid,jsonb)', 'registrar_lote(uuid,uuid,uuid,text,date,numeric,uuid)', 'lotes_con_saldo(uuid,uuid,uuid)',
    'vencimientos_proximos(uuid,integer)', 'registrar_seriales(uuid,uuid,uuid,text[],uuid)', 'vender_serial(uuid,text)',
    'consultar_serial(uuid,text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
