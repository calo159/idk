-- 0015: comparador de proveedores y alertas de alzas de precio (Fase 2: 2.4)
-- Se apoya en `precios_proveedor`, que ya se llena sola al confirmar cada compra (y se limpia al anularla).

-- Último precio de cada proveedor para un producto, ordenado del más barato al más caro.
create or replace function comparar_proveedores(p_org uuid, p_producto uuid)
returns table (proveedor_id uuid, proveedor text, ultimo_costo numeric, fecha date, compras bigint,
               costo_minimo numeric, costo_maximo numeric, diferencia_vs_mejor numeric, pct_vs_mejor numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero','contador']::rol_miembro[]) then
    raise exception 'Sin permiso para comparar proveedores';
  end if;
  return query
  with ultimo as (
    select distinct on (pp.proveedor_id) pp.proveedor_id, pp.costo_unitario_base as costo, pp.fecha
      from precios_proveedor pp
     where pp.organizacion_id = p_org and pp.producto_id = p_producto
     order by pp.proveedor_id, pp.fecha desc, pp.id desc
  ), agg as (
    select pp.proveedor_id, count(*) as n, min(pp.costo_unitario_base) as mn, max(pp.costo_unitario_base) as mx
      from precios_proveedor pp where pp.organizacion_id = p_org and pp.producto_id = p_producto group by pp.proveedor_id
  ), mejor as (select min(costo) as m from ultimo)
  select u.proveedor_id, pr.nombre, u.costo::numeric, u.fecha, a.n, a.mn::numeric, a.mx::numeric,
         (u.costo - mejor.m)::numeric,
         case when mejor.m > 0 then round((u.costo - mejor.m) / mejor.m * 100, 1) else 0 end::numeric
    from ultimo u
    join agg a on a.proveedor_id = u.proveedor_id
    join proveedores pr on pr.id = u.proveedor_id
    cross join mejor
   order by u.costo, pr.nombre;
end $$;

-- Productos cuyo último costo con un proveedor subió respecto a su compra anterior con ese mismo proveedor.
create or replace function alzas_de_precio(p_org uuid, p_dias int default 30, p_umbral numeric default 5)
returns table (producto_id uuid, producto text, proveedor_id uuid, proveedor text, costo_anterior numeric,
               costo_nuevo numeric, pct numeric, fecha date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero','contador']::rol_miembro[]) then
    raise exception 'Sin permiso para ver alzas de precio';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 365 then raise exception 'Los días deben estar entre 1 y 365'; end if;
  return query
  with ordenado as (
    select pp.*, lag(pp.costo_unitario_base) over (partition by pp.proveedor_id, pp.producto_id order by pp.fecha, pp.id) as anterior,
           row_number() over (partition by pp.proveedor_id, pp.producto_id order by pp.fecha desc, pp.id desc) as rn
      from precios_proveedor pp where pp.organizacion_id = p_org
  )
  select o.producto_id, p.nombre, o.proveedor_id, pr.nombre, o.anterior::numeric, o.costo_unitario_base::numeric,
         round((o.costo_unitario_base - o.anterior) / o.anterior * 100, 1)::numeric, o.fecha
    from ordenado o
    join productos p on p.id = o.producto_id
    join proveedores pr on pr.id = o.proveedor_id
   where o.rn = 1 and o.anterior > 0
     and o.costo_unitario_base > o.anterior * (1 + p_umbral / 100)
     and o.fecha >= (now() at time zone 'America/Bogota')::date - p_dias
   order by (o.costo_unitario_base - o.anterior) / o.anterior desc;
end $$;

-- Al registrar un precio nuevo, alerta si subió 10 % o más frente a la compra anterior del mismo proveedor.
create or replace function alerta_alza_precio() returns trigger
language plpgsql security definer set search_path = public as $$
declare anterior numeric; nombre text; prov text;
begin
  select costo_unitario_base into anterior from precios_proveedor
   where organizacion_id = new.organizacion_id and proveedor_id = new.proveedor_id and producto_id = new.producto_id
     and id < new.id order by fecha desc, id desc limit 1;
  if anterior is not null and anterior > 0 and new.costo_unitario_base >= anterior * 1.10 then
    select p.nombre into nombre from productos p where p.id = new.producto_id;
    select pr.nombre into prov from proveedores pr where pr.id = new.proveedor_id;
    perform crear_alerta_unica(new.organizacion_id, 'alza_precio', new.producto_id::text || ':' || new.proveedor_id::text, 'media',
      prov || ' subió el costo de ' || nombre || ' un ' || round((new.costo_unitario_base - anterior) / anterior * 100) || ' %',
      jsonb_build_object('producto_id', new.producto_id, 'proveedor_id', new.proveedor_id,
                         'anterior', anterior, 'nuevo', new.costo_unitario_base));
  end if;
  return new;
end $$;
create trigger trg_alerta_alza_precio after insert on precios_proveedor
  for each row execute function alerta_alza_precio();

do $$
declare f text;
begin
  foreach f in array array['comparar_proveedores(uuid,uuid)', 'alzas_de_precio(uuid,int,numeric)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
