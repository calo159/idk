-- 0026: calendario de temporadas (Fase 3: 3.7)
-- Una temporada multiplica el ritmo de venta esperado (Navidad ×1,5, Día de la Madre ×1,4…), para todo el negocio
-- o solo para una categoría. Se repite cada año y puede cruzar el cambio de año (1 dic – 6 ene).
-- La compra sugerida (3.6) usa el factor promedio de los días que debe cubrir el pedido: si compras en noviembre para
-- diciembre, te sugiere más.

create table temporadas (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  nombre text not null,
  mes_inicio integer not null check (mes_inicio between 1 and 12),
  dia_inicio integer not null check (dia_inicio between 1 and 31),
  mes_fin integer not null check (mes_fin between 1 and 12),
  dia_fin integer not null check (dia_fin between 1 and 31),
  factor numeric(4,2) not null check (factor >= 0.1 and factor <= 10),
  categoria_id uuid references categorias(id),
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);
alter table temporadas enable row level security;
create policy temporadas_leer on temporadas for select using (organizacion_id in (select mis_organizaciones()));
create trigger trg_misma_org before insert or update on temporadas
  for each row execute function exigir_misma_organizacion('categoria_id:categorias');

create or replace function guardar_temporada(p_org uuid, p_nombre text, p_mes_ini int, p_dia_ini int, p_mes_fin int, p_dia_fin int,
  p_factor numeric, p_categoria uuid default null, p_id uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare nuevo uuid;
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin editan temporadas'; end if;
  if coalesce(trim(p_nombre), '') = '' then raise exception 'La temporada necesita un nombre'; end if;
  if p_factor is null or p_factor < 0.1 or p_factor > 10 then raise exception 'El factor debe estar entre 0,1 y 10'; end if;
  -- Fechas válidas (se prueba con un año bisiesto para aceptar 29 de febrero).
  perform make_date(2024, p_mes_ini, p_dia_ini);
  perform make_date(2024, p_mes_fin, p_dia_fin);
  if p_categoria is not null and not exists (select 1 from categorias where id = p_categoria and organizacion_id = p_org) then
    raise exception 'Categoría no existe';
  end if;
  if p_id is null then
    insert into temporadas (organizacion_id, nombre, mes_inicio, dia_inicio, mes_fin, dia_fin, factor, categoria_id)
    values (p_org, trim(p_nombre), p_mes_ini, p_dia_ini, p_mes_fin, p_dia_fin, p_factor, p_categoria) returning id into nuevo;
  else
    update temporadas set nombre = trim(p_nombre), mes_inicio = p_mes_ini, dia_inicio = p_dia_ini, mes_fin = p_mes_fin, dia_fin = p_dia_fin,
           factor = p_factor, categoria_id = p_categoria
     where id = p_id and organizacion_id = p_org returning id into nuevo;
    if nuevo is null then raise exception 'Temporada no existe'; end if;
  end if;
  return nuevo;
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'Fecha inválida';
end $$;

create or replace function activar_temporada(p_id uuid, p_activa boolean) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  select organizacion_id into org from temporadas where id = p_id;
  if org is null or org not in (select mis_organizaciones()) then raise exception 'Temporada no existe'; end if;
  if not tiene_rol(org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin editan temporadas'; end if;
  update temporadas set activa = p_activa where id = p_id;
end $$;

-- Temporadas típicas de Colombia (el dueño las ajusta a su negocio). No repite las que ya existen por nombre.
create or replace function cargar_temporadas_base(p_org uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; t record;
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin editan temporadas'; end if;
  for t in select * from (values
    ('Navidad y fin de año', 12, 1, 1, 6, 1.50),
    ('Día de la Madre', 5, 1, 5, 14, 1.40),
    ('Día del Padre', 6, 10, 6, 21, 1.30),
    ('Amor y Amistad', 9, 10, 9, 20, 1.25),
    ('Regreso a clases (calendario A)', 1, 10, 2, 15, 1.30),
    ('Vacaciones de mitad de año', 6, 20, 7, 10, 1.20)
  ) as x(nombre, mi, di, mf, df, f) loop
    if not exists (select 1 from temporadas where organizacion_id = p_org and nombre = t.nombre) then
      insert into temporadas (organizacion_id, nombre, mes_inicio, dia_inicio, mes_fin, dia_fin, factor)
      values (p_org, t.nombre, t.mi, t.di, t.mf, t.df, t.f);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- ¿El día `d` cae dentro de la temporada? (se repite cada año; admite cruce de año)
create or replace function dia_en_temporada(d date, mi int, di int, mf int, df int) returns boolean
language sql immutable as $$
  select case
    when (mi * 100 + di) <= (mf * 100 + df) then (extract(month from d) * 100 + extract(day from d)) between (mi * 100 + di) and (mf * 100 + df)
    else (extract(month from d) * 100 + extract(day from d)) >= (mi * 100 + di) or (extract(month from d) * 100 + extract(day from d)) <= (mf * 100 + df)
  end
$$;

-- Factor promedio de ritmo sobre los `p_dias` días desde `p_desde`: cada día vale el mayor factor activo ese día (o 1).
create or replace function factor_temporada(p_org uuid, p_categoria uuid, p_desde date, p_dias integer) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(round(avg(f), 3), 1)::numeric
    from (
      select d::date, coalesce(max(t.factor), 1) as f
        from generate_series(p_desde, p_desde + greatest(p_dias, 1) - 1, interval '1 day') d
        left join temporadas t on t.organizacion_id = p_org and t.activa
             and (t.categoria_id is null or t.categoria_id = p_categoria)
             and dia_en_temporada(d::date, t.mes_inicio, t.dia_inicio, t.mes_fin, t.dia_fin)
       group by d
    ) x
$$;
revoke all on function factor_temporada(uuid, uuid, date, integer) from public, anon, authenticated;

-- La compra sugerida ahora multiplica el ritmo por el factor de temporada del horizonte (columna nueva al final).
drop function if exists sugerencia_compras(uuid, integer, integer);
drop function if exists calcular_sugerencia(uuid, integer, integer);

create function calcular_sugerencia(p_org uuid, p_cobertura integer default 14, p_entrega integer default 3)
returns table (producto_id uuid, producto text, unidad text, stock numeric, stock_minimo numeric, venta_diaria numeric,
               dias_restantes numeric, sugerida numeric, urgencia text, proveedor_id uuid, proveedor text, costo_estimado numeric,
               valor_estimado numeric, factor numeric)
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
  mejor as (select distinct on (producto_id) producto_id, proveedor_id, costo from precios order by producto_id, costo, proveedor_id),
  base as (
    select p.id, p.nombre, p.unidad_base, p.stock_minimo, coalesce(x.cant, 0) as stock,
           round((0.6 * coalesce(v.u14, 0) / 14.0 + 0.4 * coalesce(v.u60, 0) / 60.0)::numeric, 4) as vd_base,
           factor_temporada(p_org, p.categoria_id, (select d from hoy), p_cobertura + p_entrega) as fac
      from productos p
      join ventas_prod v on v.producto_id = p.id
      left join existencia x on x.producto_id = p.id
     where p.organizacion_id = p_org and p.activo and p.maneja_inventario
  ),
  calc as (
    select b.*, round(b.vd_base * b.fac, 4) as vd,
           case when b.vd_base * b.fac > 0 then round(greatest(b.stock, 0) / (b.vd_base * b.fac), 1) end as dias,
           greatest(ceil(greatest(b.vd_base * b.fac * (p_cobertura + p_entrega) - b.stock, b.stock_minimo - b.stock, 0)), 0) as sug
      from base b
  )
  select c.id, c.nombre, c.unidad_base, c.stock, c.stock_minimo, c.vd, c.dias, c.sug::numeric,
         case when c.dias is not null and c.dias <= p_entrega then 'critica' else 'pronto' end,
         m.proveedor_id, pr.nombre, m.costo, round(c.sug * coalesce(m.costo, 0), 2), c.fac
    from calc c
    left join mejor m on m.producto_id = c.id
    left join proveedores pr on pr.id = m.proveedor_id
   where c.sug > 0 and (c.dias is null or c.dias <= p_cobertura + p_entrega or c.stock <= c.stock_minimo)
   order by (c.dias is not null and c.dias <= p_entrega) desc, c.dias nulls last, c.nombre
$$;
revoke all on function calcular_sugerencia(uuid, integer, integer) from public, anon, authenticated;

create function sugerencia_compras(p_org uuid, p_cobertura integer default 14, p_entrega integer default 3)
returns table (producto_id uuid, producto text, unidad text, stock numeric, stock_minimo numeric, venta_diaria numeric,
               dias_restantes numeric, sugerida numeric, urgencia text, proveedor_id uuid, proveedor text, costo_estimado numeric,
               valor_estimado numeric, factor numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero','contador']::rol_miembro[]) then raise exception 'Sin permiso para ver sugerencias de compra'; end if;
  if p_cobertura is null or p_cobertura < 1 or p_cobertura > 90 then raise exception 'La cobertura debe estar entre 1 y 90 días'; end if;
  if p_entrega is null or p_entrega < 0 or p_entrega > 60 then raise exception 'El tiempo de entrega debe estar entre 0 y 60 días'; end if;
  return query select * from calcular_sugerencia(p_org, p_cobertura, p_entrega);
end $$;
revoke all on function sugerencia_compras(uuid, integer, integer) from public, anon;
grant execute on function sugerencia_compras(uuid, integer, integer) to authenticated;

do $$
declare f text;
begin
  foreach f in array array['guardar_temporada(uuid,text,int,int,int,int,numeric,uuid,uuid)', 'activar_temporada(uuid,boolean)', 'cargar_temporadas_base(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
