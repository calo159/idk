-- 0031: venta en ruta (Fase 3: 3.13) — plan de ruta por día, visitas con ubicación y resumen para el dueño.
--
--  * El dueño/admin arma la ruta de cada vendedor por día de la semana (lista ordenada de clientes).
--  * El vendedor ve «su ruta de hoy» con la deuda de cada cliente, registra cada visita (pedido, cobro, sin pedido, cerrado…)
--    con la ubicación si la tiene, y todo se puede hacer sin internet: las visitas son idempotentes por `offline_id`.
--  * Las ventas y abonos usan el flujo normal (POS y abonos); una venta de un vendedor de ruta queda con origen «ruta».

alter table clientes add column if not exists direccion text check (direccion is null or char_length(direccion) <= 200);

create table ruta_clientes (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  usuario_id uuid not null references auth.users(id),
  cliente_id uuid not null references clientes(id) on delete cascade,
  dia_semana integer not null check (dia_semana between 1 and 7), -- 1 = lunes … 7 = domingo (ISO)
  orden integer not null check (orden > 0),
  unique (usuario_id, dia_semana, cliente_id)
);
create index on ruta_clientes (organizacion_id, usuario_id, dia_semana, orden);
alter table ruta_clientes enable row level security;
create policy ruta_clientes_leer on ruta_clientes for select
  using (tiene_rol(organizacion_id, array['dueno','admin']::rol_miembro[]) or (usuario_id = auth.uid() and organizacion_id in (select mis_organizaciones())));
create trigger ruta_clientes_misma_org before insert or update on ruta_clientes
  for each row execute function exigir_misma_organizacion('cliente_id:clientes');

create table visitas (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  usuario_id uuid not null references auth.users(id),
  cliente_id uuid not null references clientes(id),
  resultado text not null check (resultado in ('pedido', 'cobro', 'sin_pedido', 'cerrado', 'no_estaba')),
  nota text check (nota is null or char_length(nota) <= 300),
  lat numeric(9,6) check (lat between -90 and 90),
  lng numeric(9,6) check (lng between -180 and 180),
  precision_m integer check (precision_m is null or precision_m >= 0),
  offline_id uuid not null,
  visitado_en timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  unique (organizacion_id, offline_id),
  check ((lat is null) = (lng is null))
);
create index on visitas (organizacion_id, visitado_en desc);
create index on visitas (cliente_id, visitado_en desc);
alter table visitas enable row level security;
create policy visitas_leer on visitas for select
  using (tiene_rol(organizacion_id, array['dueno','admin','contador']::rol_miembro[]) or (usuario_id = auth.uid() and organizacion_id in (select mis_organizaciones())));
create trigger visitas_misma_org before insert on visitas
  for each row execute function exigir_misma_organizacion('cliente_id:clientes');

-- Reemplaza la lista de clientes de un vendedor para un día (el orden del arreglo es el orden de la visita).
create or replace function guardar_ruta(p_org uuid, p_usuario uuid, p_dia integer, p_clientes uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin arman las rutas'; end if;
  if p_dia is null or p_dia not between 1 and 7 then raise exception 'El día debe ir de 1 (lunes) a 7 (domingo)'; end if;
  if not exists (select 1 from miembros where organizacion_id = p_org and usuario_id = p_usuario and activo) then raise exception 'Ese usuario no es parte del negocio'; end if;
  p_clientes := coalesce(p_clientes, '{}');
  if cardinality(p_clientes) > 200 then raise exception 'Una ruta diaria admite máximo 200 clientes'; end if;
  if (select count(distinct x) from unnest(p_clientes) x) <> cardinality(p_clientes) then raise exception 'Hay clientes repetidos en la ruta'; end if;
  if exists (select 1 from unnest(p_clientes) x where not exists (select 1 from clientes c where c.id = x and c.organizacion_id = p_org and c.activo)) then
    raise exception 'Algún cliente de la ruta no existe o está inactivo';
  end if;
  delete from ruta_clientes where usuario_id = p_usuario and dia_semana = p_dia and organizacion_id = p_org;
  insert into ruta_clientes (organizacion_id, usuario_id, cliente_id, dia_semana, orden)
  select p_org, p_usuario, x.id, p_dia, x.ord from unnest(p_clientes) with ordinality as x(id, ord);
  get diagnostics n = row_count;
  return n;
end $$;

-- La ruta de hoy del usuario que consulta, con lo que necesita saber antes de tocar la puerta.
create or replace function ruta_del_dia(p_org uuid, p_fecha date default null)
returns table (cliente_id uuid, nombre text, telefono text, direccion text, saldo numeric, vencido numeric, dias_mora integer, orden integer,
               visitado boolean, resultado text, ultima_visita date, ultima_compra date)
language plpgsql stable security definer set search_path = public as $$
declare dia date := coalesce(p_fecha, (now() at time zone 'America/Bogota')::date);
begin
  if not tiene_rol(p_org, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then raise exception 'Sin permiso para ver la ruta'; end if;
  return query
  select c.id, c.nombre, c.telefono, c.direccion, c.saldo,
         coalesce((select ca.vencido from calcular_cartera(p_org, c.id) ca limit 1), 0)::numeric,
         coalesce((select ca.dias_mora from calcular_cartera(p_org, c.id) ca limit 1), 0)::integer,
         r.orden,
         exists (select 1 from visitas v where v.cliente_id = c.id and v.usuario_id = auth.uid() and (v.visitado_en at time zone 'America/Bogota')::date = dia),
         (select v.resultado from visitas v where v.cliente_id = c.id and v.usuario_id = auth.uid() and (v.visitado_en at time zone 'America/Bogota')::date = dia order by v.visitado_en desc limit 1),
         (select max((v.visitado_en at time zone 'America/Bogota')::date) from visitas v where v.cliente_id = c.id and v.visitado_en < (dia + 1)::timestamp at time zone 'America/Bogota'),
         (select max((ve.creado_en at time zone 'America/Bogota')::date) from ventas ve where ve.cliente_id = c.id and ve.estado = 'confirmado')
    from ruta_clientes r join clientes c on c.id = r.cliente_id
   where r.organizacion_id = p_org and r.usuario_id = auth.uid() and r.dia_semana = extract(isodow from dia)::integer and c.activo
   order by r.orden;
end $$;

create or replace function registrar_visita(p_org uuid, p_cliente uuid, p_resultado text, p_nota text, p_lat numeric, p_lng numeric,
                                            p_precision integer, p_offline_id uuid, p_visitado_en timestamptz default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare cuando timestamptz := coalesce(p_visitado_en, now()); nuevo uuid;
begin
  if not tiene_rol(p_org, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then raise exception 'Sin permiso para registrar visitas'; end if;
  if p_offline_id is null then raise exception 'Falta el identificador de la visita'; end if;
  if not exists (select 1 from clientes where id = p_cliente and organizacion_id = p_org) then raise exception 'Cliente no existe'; end if;
  -- Misma tolerancia que las ventas hechas sin internet: hasta 7 días atrás y nada del futuro.
  if cuando > now() + interval '5 minutes' or cuando < now() - interval '7 days' then raise exception 'La fecha de la visita no es válida'; end if;
  insert into visitas (organizacion_id, usuario_id, cliente_id, resultado, nota, lat, lng, precision_m, offline_id, visitado_en)
  values (p_org, auth.uid(), p_cliente, p_resultado, nullif(trim(coalesce(p_nota, '')), ''), p_lat, p_lng, p_precision, p_offline_id, cuando)
  on conflict (organizacion_id, offline_id) do nothing
  returning id into nuevo;
  if nuevo is null then select id into nuevo from visitas where organizacion_id = p_org and offline_id = p_offline_id; end if;
  return nuevo;
end $$;

-- Para el dueño: cómo va cada vendedor de ruta en un día.
create or replace function resumen_rutas(p_org uuid, p_fecha date default null)
returns table (usuario_id uuid, nombre text, planificadas integer, visitadas integer, pedidos integer, cobros integer, sin_pedido integer, cerrados integer, ventas numeric)
language plpgsql stable security definer set search_path = public as $$
declare dia date := coalesce(p_fecha, (now() at time zone 'America/Bogota')::date);
begin
  if not tiene_rol(p_org, array['dueno','admin','contador']::rol_miembro[]) then raise exception 'Sin permiso para ver las rutas'; end if;
  return query
  select m.usuario_id, coalesce(m.nombre, 'Sin nombre'),
         (select count(*) from ruta_clientes r where r.usuario_id = m.usuario_id and r.organizacion_id = p_org and r.dia_semana = extract(isodow from dia)::integer)::integer,
         (select count(distinct v.cliente_id) from visitas v where v.usuario_id = m.usuario_id and v.organizacion_id = p_org and (v.visitado_en at time zone 'America/Bogota')::date = dia)::integer,
         (select count(*) from visitas v where v.usuario_id = m.usuario_id and v.organizacion_id = p_org and v.resultado = 'pedido' and (v.visitado_en at time zone 'America/Bogota')::date = dia)::integer,
         (select count(*) from visitas v where v.usuario_id = m.usuario_id and v.organizacion_id = p_org and v.resultado = 'cobro' and (v.visitado_en at time zone 'America/Bogota')::date = dia)::integer,
         (select count(*) from visitas v where v.usuario_id = m.usuario_id and v.organizacion_id = p_org and v.resultado in ('sin_pedido', 'no_estaba') and (v.visitado_en at time zone 'America/Bogota')::date = dia)::integer,
         (select count(*) from visitas v where v.usuario_id = m.usuario_id and v.organizacion_id = p_org and v.resultado = 'cerrado' and (v.visitado_en at time zone 'America/Bogota')::date = dia)::integer,
         coalesce((select sum(ve.total) from ventas ve where ve.usuario_id = m.usuario_id and ve.organizacion_id = p_org and ve.estado = 'confirmado' and ve.origen = 'ruta' and (ve.creado_en at time zone 'America/Bogota')::date = dia), 0)::numeric
    from miembros m
   where m.organizacion_id = p_org and m.activo
     and (m.rol = 'ruta' or exists (select 1 from ruta_clientes r where r.usuario_id = m.usuario_id and r.organizacion_id = p_org)
                         or exists (select 1 from visitas v where v.usuario_id = m.usuario_id and v.organizacion_id = p_org and (v.visitado_en at time zone 'America/Bogota')::date = dia))
   order by 2;
end $$;

-- Para el dueño: el detalle de cada visita del día (con la ubicación para abrirla en el mapa).
create or replace function visitas_del_dia(p_org uuid, p_fecha date default null)
returns table (id uuid, usuario text, cliente text, resultado text, nota text, lat numeric, lng numeric, precision_m integer, visitado_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare dia date := coalesce(p_fecha, (now() at time zone 'America/Bogota')::date);
begin
  if not tiene_rol(p_org, array['dueno','admin','contador']::rol_miembro[]) then raise exception 'Sin permiso para ver las rutas'; end if;
  return query
  select v.id, coalesce(m.nombre, 'Sin nombre'), c.nombre, v.resultado, v.nota, v.lat, v.lng, v.precision_m, v.visitado_en
    from visitas v join clientes c on c.id = v.cliente_id left join miembros m on m.usuario_id = v.usuario_id and m.organizacion_id = v.organizacion_id
   where v.organizacion_id = p_org and (v.visitado_en at time zone 'America/Bogota')::date = dia
   order by v.visitado_en;
end $$;

do $$
declare f text;
begin
  foreach f in array array['guardar_ruta(uuid,uuid,integer,uuid[])', 'ruta_del_dia(uuid,date)',
                           'registrar_visita(uuid,uuid,text,text,numeric,numeric,integer,uuid,timestamptz)',
                           'resumen_rutas(uuid,date)', 'visitas_del_dia(uuid,date)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
