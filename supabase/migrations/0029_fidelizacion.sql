-- 0029: fidelización (Fase 3: 3.10) — puntos por celular, cumpleaños y clientes inactivos.
--
--  * Puntos: se ganan con cada venta confirmada a un cliente identificado (por su celular) y se revierten si la venta se anula.
--    Es un libro de movimientos (nunca se edita el saldo): saldo = suma de movimientos.
--  * Canje: 1 punto vale `valor_punto` pesos; no se puede canjear más de lo que se tiene.
--  * Cumpleaños e inactivos: lista de clientes a contactar (sin repetir) para enviar por WhatsApp desde n8n o a mano.
--    El saludo de cumpleaños regala puntos de bono (auditable en el libro), no un descuento que alguien deba recordar.

alter table organizaciones
  add column if not exists fidelizacion_activa boolean not null default false,
  add column if not exists pesos_por_punto numeric(14,2) not null default 1000 check (pesos_por_punto >= 100),
  add column if not exists valor_punto numeric(14,2) not null default 10 check (valor_punto > 0),
  add column if not exists puntos_cumpleanos integer not null default 50 check (puntos_cumpleanos between 0 and 10000);

create table puntos_movimientos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  cliente_id uuid not null references clientes(id),
  puntos integer not null check (puntos <> 0),
  motivo text not null check (motivo in ('compra', 'anulacion', 'canje', 'cumpleanos')),
  venta_id uuid references ventas(id),
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index on puntos_movimientos (cliente_id, creado_en desc);
create unique index puntos_una_por_venta on puntos_movimientos (venta_id, motivo) where venta_id is not null;
alter table puntos_movimientos enable row level security;
create policy puntos_leer on puntos_movimientos for select
  using (tiene_rol(organizacion_id, array['dueno','admin','vendedor','contador']::rol_miembro[]));
create trigger puntos_misma_org before insert on puntos_movimientos
  for each row execute function exigir_misma_organizacion('cliente_id:clientes');

create table contactos_fidelizacion (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  cliente_id uuid not null references clientes(id),
  tipo text not null check (tipo in ('cumpleanos', 'inactivo')),
  enviado_en timestamptz not null default now()
);
create index on contactos_fidelizacion (cliente_id, tipo, enviado_en desc);
alter table contactos_fidelizacion enable row level security;
create policy contactos_fid_leer on contactos_fidelizacion for select
  using (tiene_rol(organizacion_id, array['dueno','admin','vendedor']::rol_miembro[]));

-- Puntos automáticos por venta: gana al confirmarse, revierte al anularse.
create or replace function puntos_por_venta() returns trigger
language plpgsql security definer set search_path = public as $$
declare cfg record; ganados integer;
begin
  if new.cliente_id is null then return new; end if;
  select fidelizacion_activa, pesos_por_punto into cfg from organizaciones where id = new.organizacion_id;
  if not coalesce(cfg.fidelizacion_activa, false) then return new; end if;
  if new.estado = 'confirmado' and (tg_op = 'INSERT' or old.estado is distinct from 'confirmado') then
    ganados := floor(new.total / cfg.pesos_por_punto)::integer;
    if ganados > 0 then
      insert into puntos_movimientos (organizacion_id, cliente_id, puntos, motivo, venta_id)
      values (new.organizacion_id, new.cliente_id, ganados, 'compra', new.id) on conflict do nothing;
    end if;
  elsif new.estado = 'anulado' and tg_op = 'UPDATE' and old.estado = 'confirmado' then
    select coalesce(sum(puntos), 0) into ganados from puntos_movimientos where venta_id = new.id and motivo = 'compra';
    if ganados > 0 then
      insert into puntos_movimientos (organizacion_id, cliente_id, puntos, motivo, venta_id)
      values (new.organizacion_id, new.cliente_id, -ganados, 'anulacion', new.id) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
create trigger ventas_puntos after insert or update of estado on ventas
  for each row execute function puntos_por_venta();

create or replace function saldo_puntos(p_cliente uuid) returns integer
language sql stable security definer set search_path = public as $$
  select greatest(coalesce(sum(p.puntos), 0), 0)::integer from puntos_movimientos p
   where p.cliente_id = p_cliente and p.organizacion_id in (select mis_organizaciones());
$$;

-- Saldo de puntos de todos los clientes con puntos (para listas y el POS).
create or replace function saldos_puntos(p_org uuid) returns table (cliente_id uuid, puntos integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_org not in (select mis_organizaciones()) then raise exception 'Sin acceso'; end if;
  return query
  select p.cliente_id, greatest(sum(p.puntos), 0)::integer from puntos_movimientos p
   where p.organizacion_id = p_org group by p.cliente_id having sum(p.puntos) > 0;
end $$;

-- Canje: devuelve los pesos de descuento que se deben aplicar a la venta en curso.
create or replace function canjear_puntos(p_org uuid, p_cliente uuid, p_puntos integer) returns numeric
language plpgsql security definer set search_path = public as $$
declare saldo integer; valor numeric;
begin
  if not tiene_rol(p_org, array['dueno','admin','vendedor']::rol_miembro[]) then raise exception 'Sin permiso para canjear puntos'; end if;
  if p_puntos is null or p_puntos <= 0 then raise exception 'Indica cuántos puntos canjear'; end if;
  if not exists (select 1 from clientes where id = p_cliente and organizacion_id = p_org) then raise exception 'Cliente no existe'; end if;
  select valor_punto into valor from organizaciones where id = p_org;
  -- Bloquea al cliente para que dos canjes simultáneos no gasten los mismos puntos.
  perform 1 from clientes where id = p_cliente for update;
  select coalesce(sum(puntos), 0) into saldo from puntos_movimientos where cliente_id = p_cliente;
  if p_puntos > saldo then raise exception 'El cliente solo tiene % puntos', greatest(saldo, 0); end if;
  insert into puntos_movimientos (organizacion_id, cliente_id, puntos, motivo, usuario_id)
  values (p_org, p_cliente, -p_puntos, 'canje', auth.uid());
  return (p_puntos * valor)::numeric(14,2);
end $$;

-- Canje hecho dentro de una venta ya confirmada. Si los puntos no alcanzan (p. ej. dos ventas hechas sin internet con los
-- mismos puntos), la venta no se toca: se avisa al dueño con una alerta y se devuelve false.
create or replace function canjear_puntos_venta(p_venta uuid, p_puntos integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare v record; saldo integer; valor numeric;
begin
  select id, organizacion_id, cliente_id, numero into v from ventas where id = p_venta;
  if v.id is null or v.cliente_id is null or p_puntos <= 0 then return false; end if;
  if not tiene_rol(v.organizacion_id, array['dueno','admin','vendedor']::rol_miembro[]) then raise exception 'Sin permiso para canjear puntos'; end if;
  perform 1 from clientes where id = v.cliente_id for update;
  select coalesce(sum(puntos), 0) into saldo from puntos_movimientos where cliente_id = v.cliente_id;
  if p_puntos > saldo then
    select valor_punto into valor from organizaciones where id = v.organizacion_id;
    perform crear_alerta_unica(v.organizacion_id, 'canje_sin_saldo', p_venta::text, 'media',
      format('La venta #%s descontó %s puntos pero el cliente solo tenía %s. Revísala.', v.numero, p_puntos, greatest(saldo, 0)),
      jsonb_build_object('venta_id', p_venta, 'puntos', p_puntos, 'saldo', greatest(saldo, 0), 'valor', p_puntos * valor));
    return false;
  end if;
  insert into puntos_movimientos (organizacion_id, cliente_id, puntos, motivo, venta_id, usuario_id)
  values (v.organizacion_id, v.cliente_id, -p_puntos, 'canje', p_venta, auth.uid()) on conflict do nothing;
  return true;
end $$;

create or replace function configurar_fidelizacion(p_org uuid, p_activa boolean, p_pesos_por_punto numeric, p_valor_punto numeric, p_puntos_cumple integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin configuran la fidelización'; end if;
  update organizaciones set fidelizacion_activa = p_activa, pesos_por_punto = p_pesos_por_punto, valor_punto = p_valor_punto,
         puntos_cumpleanos = p_puntos_cumple where id = p_org;
end $$;

-- Quién toca contactar hoy (sin chequeo de rol; las funciones públicas lo hacen).
create or replace function calcular_contactos_fidelizacion(p_org uuid, p_dias_inactivo integer default 30)
returns table (cliente_id uuid, nombre text, telefono text, tipo text, dato integer, puntos integer)
language sql stable security definer set search_path = public as $$
  with hoy as (select (now() at time zone 'America/Bogota')::date as d),
  base as (
    select c.id, c.nombre, c.telefono, c.fecha_nacimiento,
           (select count(*) from ventas v where v.cliente_id = c.id and v.estado = 'confirmado') as compras,
           (select max((v.creado_en at time zone 'America/Bogota')::date) from ventas v where v.cliente_id = c.id and v.estado = 'confirmado') as ultima,
           (select greatest(coalesce(sum(p.puntos), 0), 0) from puntos_movimientos p where p.cliente_id = c.id)::integer as puntos
      from clientes c
     where c.organizacion_id = p_org and c.activo and c.acepta_mensajes and c.telefono is not null
  )
  select b.id, b.nombre, b.telefono, 'cumpleanos'::text, 0, b.puntos
    from base b, hoy
   where b.fecha_nacimiento is not null
     and (extract(month from b.fecha_nacimiento) = extract(month from hoy.d) and extract(day from b.fecha_nacimiento) = extract(day from hoy.d)
          -- Quien nació un 29 de febrero celebra el 28 en años no bisiestos.
          or (extract(month from b.fecha_nacimiento) = 2 and extract(day from b.fecha_nacimiento) = 29
              and extract(month from hoy.d) = 2 and extract(day from hoy.d) = 28
              and extract(day from (date_trunc('year', hoy.d) + interval '2 months - 1 day')) = 28))
     and not exists (select 1 from contactos_fidelizacion f where f.cliente_id = b.id and f.tipo = 'cumpleanos' and f.enviado_en > now() - interval '300 days')
  union all
  select b.id, b.nombre, b.telefono, 'inactivo'::text, (hoy.d - b.ultima)::integer, b.puntos
    from base b, hoy
   where b.compras >= 2 and b.ultima is not null
     and hoy.d - b.ultima >= p_dias_inactivo and hoy.d - b.ultima <= 365
     and not exists (select 1 from contactos_fidelizacion f where f.cliente_id = b.id and f.tipo = 'inactivo' and f.enviado_en > now() - interval '60 days')
  order by 4, 5 desc;
$$;

create or replace function fidelizacion_pendiente(p_org uuid)
returns table (cliente_id uuid, nombre text, telefono text, tipo text, dato integer, puntos integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','vendedor']::rol_miembro[]) then raise exception 'Sin permiso'; end if;
  return query select * from calcular_contactos_fidelizacion(p_org);
end $$;

-- Registra que se contactó (a mano o desde n8n). El saludo de cumpleaños suma los puntos de bono.
create or replace function registrar_contacto_fidelizacion_interno(p_org uuid, p_cliente uuid, p_tipo text) returns void
language plpgsql security definer set search_path = public as $$
declare bono integer;
begin
  if not exists (select 1 from clientes where id = p_cliente and organizacion_id = p_org) then raise exception 'Cliente no existe'; end if;
  insert into contactos_fidelizacion (organizacion_id, cliente_id, tipo) values (p_org, p_cliente, p_tipo);
  if p_tipo = 'cumpleanos' then
    select puntos_cumpleanos into bono from organizaciones where id = p_org;
    if bono > 0 then
      insert into puntos_movimientos (organizacion_id, cliente_id, puntos, motivo) values (p_org, p_cliente, bono, 'cumpleanos');
    end if;
  end if;
end $$;

create or replace function marcar_contacto_fidelizacion(p_org uuid, p_cliente uuid, p_tipo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','vendedor']::rol_miembro[]) then raise exception 'Sin permiso'; end if;
  if p_tipo not in ('cumpleanos', 'inactivo') then raise exception 'Tipo de contacto inválido'; end if;
  perform registrar_contacto_fidelizacion_interno(p_org, p_cliente, p_tipo);
end $$;

-- Para n8n (service_role): todas las organizaciones con fidelización activa.
create or replace function fidelizacion_para_n8n()
returns table (organizacion_id uuid, organizacion text, cliente_id uuid, cliente text, telefono text, tipo text, dato integer, puntos integer, puntos_bono integer, valor_punto numeric)
language sql stable security definer set search_path = public as $$
  select o.id, o.nombre, c.cliente_id, c.nombre, c.telefono, c.tipo, c.dato, c.puntos, o.puntos_cumpleanos, o.valor_punto
    from organizaciones o cross join lateral calcular_contactos_fidelizacion(o.id) c
   where o.fidelizacion_activa
   order by o.nombre, c.tipo;
$$;

create or replace function registrar_contacto_fidelizacion(p_cliente uuid, p_tipo text) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  if p_tipo not in ('cumpleanos', 'inactivo') then raise exception 'Tipo de contacto inválido'; end if;
  select organizacion_id into org from clientes where id = p_cliente;
  if org is null then raise exception 'Cliente no existe'; end if;
  perform registrar_contacto_fidelizacion_interno(org, p_cliente, p_tipo);
end $$;

do $$
declare f text;
begin
  foreach f in array array['puntos_por_venta()', 'calcular_contactos_fidelizacion(uuid,integer)', 'registrar_contacto_fidelizacion_interno(uuid,uuid,text)',
                           'fidelizacion_para_n8n()', 'registrar_contacto_fidelizacion(uuid,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  grant execute on function fidelizacion_para_n8n() to service_role;
  grant execute on function registrar_contacto_fidelizacion(uuid, text) to service_role;
  foreach f in array array['saldo_puntos(uuid)', 'saldos_puntos(uuid)', 'canjear_puntos(uuid,uuid,integer)', 'canjear_puntos_venta(uuid,integer)',
                           'configurar_fidelizacion(uuid,boolean,numeric,numeric,integer)', 'fidelizacion_pendiente(uuid)',
                           'marcar_contacto_fidelizacion(uuid,uuid,text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
