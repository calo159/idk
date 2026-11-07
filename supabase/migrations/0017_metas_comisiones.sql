-- 0017: metas y comisiones de vendedores (Fase 2: 2.10)
--  * Meta mensual de ventas por vendedor y reglas de comisión (porcentaje sobre ventas o sobre utilidad,
--    con un bono de puntos extra si se cumple la meta). Una regla sin vendedor es la general.
--  * Las ventas se cuentan NETAS de devoluciones y solo las confirmadas (las anuladas no suman).
--  * El dueño/admin ve a todos; cada vendedor ve únicamente su propio avance.

create table metas_vendedor (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  usuario_id uuid not null references auth.users(id),
  mes date not null check (mes = date_trunc('month', mes)::date),
  meta_ventas numeric(14,2) not null check (meta_ventas >= 0),
  unique (organizacion_id, usuario_id, mes)
);

create table config_comisiones (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  usuario_id uuid references auth.users(id),
  base text not null default 'ventas' check (base in ('ventas','utilidad')),
  porcentaje numeric(5,2) not null check (porcentaje >= 0 and porcentaje <= 100),
  bono_meta numeric(5,2) not null default 0 check (bono_meta >= 0 and bono_meta <= 100)
);
create unique index config_comisiones_unica on config_comisiones (organizacion_id, coalesce(usuario_id, '00000000-0000-0000-0000-000000000000'::uuid));

alter table metas_vendedor enable row level security;
alter table config_comisiones enable row level security;
create policy metas_leer on metas_vendedor for select
  using (tiene_rol(organizacion_id, array['dueno','admin','contador']::rol_miembro[]) or usuario_id = auth.uid());
create policy comisiones_leer on config_comisiones for select
  using (tiene_rol(organizacion_id, array['dueno','admin','contador']::rol_miembro[]));

create or replace function fijar_meta(p_org uuid, p_usuario uuid, p_mes date, p_meta numeric) returns void
language plpgsql security definer set search_path = public as $$
declare v_mes date := date_trunc('month', p_mes)::date;
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin fijan metas'; end if;
  if not exists (select 1 from miembros where organizacion_id = p_org and usuario_id = p_usuario and activo) then
    raise exception 'La persona no pertenece al negocio';
  end if;
  if p_meta is null or p_meta < 0 then raise exception 'La meta no puede ser negativa'; end if;
  insert into metas_vendedor (organizacion_id, usuario_id, mes, meta_ventas) values (p_org, p_usuario, v_mes, p_meta)
  on conflict (organizacion_id, usuario_id, mes) do update set meta_ventas = excluded.meta_ventas;
end $$;

create or replace function fijar_comision(p_org uuid, p_usuario uuid, p_base text, p_porcentaje numeric, p_bono numeric default 0) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin fijan comisiones'; end if;
  if p_base not in ('ventas','utilidad') then raise exception 'La base debe ser ventas o utilidad'; end if;
  if p_porcentaje is null or p_porcentaje < 0 or p_porcentaje > 100 then raise exception 'El porcentaje debe estar entre 0 y 100'; end if;
  if p_bono is null or p_bono < 0 or p_bono > 100 then raise exception 'El bono debe estar entre 0 y 100'; end if;
  if p_usuario is not null and not exists (select 1 from miembros where organizacion_id = p_org and usuario_id = p_usuario and activo) then
    raise exception 'La persona no pertenece al negocio';
  end if;
  insert into config_comisiones (organizacion_id, usuario_id, base, porcentaje, bono_meta)
  values (p_org, p_usuario, p_base, p_porcentaje, p_bono)
  on conflict (organizacion_id, coalesce(usuario_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do update set base = excluded.base, porcentaje = excluded.porcentaje, bono_meta = excluded.bono_meta;
end $$;

-- Cálculo común: avance de cada vendedor en un mes.
create or replace function calcular_avance_mes(p_org uuid, p_mes date)
returns table (usuario_id uuid, nombre text, ventas bigint, ventas_netas numeric, utilidad_neta numeric,
               meta numeric, cumplimiento numeric, base text, porcentaje numeric, comision numeric)
language sql stable security definer set search_path = public as $$
  with rango as (
    select date_trunc('month', p_mes)::date as d, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as h
  ), v as (
    select ve.usuario_id as u, count(*) as n, sum(ve.total) as t, sum(ve.total - ve.costo_total) as ut
      from ventas ve, rango
     where ve.organizacion_id = p_org and ve.estado = 'confirmado' and ve.usuario_id is not null
       and (ve.creado_en at time zone 'America/Bogota')::date between rango.d and rango.h
     group by ve.usuario_id
  ), dv as (
    select ve.usuario_id as u, sum(x.total) as t, sum(x.total - x.costo_total) as ut
      from devoluciones_cliente x
      join ventas ve on ve.id = x.venta_id, rango
     where x.organizacion_id = p_org and (x.creado_en at time zone 'America/Bogota')::date between rango.d and rango.h
     group by ve.usuario_id
  ), base as (
    select m.usuario_id, m.nombre,
           coalesce(v.n, 0) as n,
           coalesce(v.t, 0) - coalesce(dv.t, 0) as t,
           coalesce(v.ut, 0) - coalesce(dv.ut, 0) as ut,
           coalesce(mv.meta_ventas, 0.00) as meta
      from miembros m
      left join v on v.u = m.usuario_id
      left join dv on dv.u = m.usuario_id
      left join metas_vendedor mv on mv.organizacion_id = p_org and mv.usuario_id = m.usuario_id and mv.mes = (select d from rango)
     where m.organizacion_id = p_org and m.rol in ('vendedor','ruta','dueno','admin')
       and (m.activo or coalesce(v.n, 0) > 0)
  )
  select b.usuario_id, b.nombre, b.n, b.t, b.ut, b.meta,
         case when b.meta > 0 then round(b.t / b.meta * 100, 1) end,
         coalesce(cu.base, cg.base, 'ventas'),
         coalesce(cu.porcentaje, cg.porcentaje, 0)
           + case when b.meta > 0 and b.t >= b.meta then coalesce(cu.bono_meta, cg.bono_meta, 0) else 0 end,
         round(greatest(case when coalesce(cu.base, cg.base, 'ventas') = 'utilidad' then b.ut else b.t end, 0)
               * (coalesce(cu.porcentaje, cg.porcentaje, 0)
                  + case when b.meta > 0 and b.t >= b.meta then coalesce(cu.bono_meta, cg.bono_meta, 0) else 0 end) / 100, 2)
    from base b
    left join config_comisiones cu on cu.organizacion_id = p_org and cu.usuario_id = b.usuario_id
    left join config_comisiones cg on cg.organizacion_id = p_org and cg.usuario_id is null
   order by b.t desc, b.nombre
$$;
revoke all on function calcular_avance_mes(uuid, date) from public, anon, authenticated;

create or replace function reporte_comisiones(p_org uuid, p_mes date)
returns table (usuario_id uuid, nombre text, ventas bigint, ventas_netas numeric, utilidad_neta numeric,
               meta numeric, cumplimiento numeric, base text, porcentaje numeric, comision numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','contador']::rol_miembro[]) then raise exception 'Sin permiso para ver comisiones'; end if;
  return query select * from calcular_avance_mes(p_org, p_mes);
end $$;

-- Cada persona ve solo su avance (vendedores y ruta incluidos).
create or replace function mi_avance_mes(p_org uuid, p_mes date)
returns table (usuario_id uuid, nombre text, ventas bigint, ventas_netas numeric, utilidad_neta numeric,
               meta numeric, cumplimiento numeric, base text, porcentaje numeric, comision numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_org not in (select mis_organizaciones()) then raise exception 'Sin acceso'; end if;
  return query select a.* from calcular_avance_mes(p_org, p_mes) a where a.usuario_id = auth.uid();
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'fijar_meta(uuid,uuid,date,numeric)', 'fijar_comision(uuid,uuid,text,numeric,numeric)',
    'reporte_comisiones(uuid,date)', 'mi_avance_mes(uuid,date)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
