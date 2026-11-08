-- 0022: cobranza (Fase 3: 3.3) — deuda vencida, puntaje de pago y recordatorios por WhatsApp.
--
--  * La deuda de un cliente se reparte entre las ventas fiadas (y deudas anteriores) más NUEVAS primero: los abonos
--    pagan lo más viejo (FIFO). Así se sabe qué parte está vencida y hace cuántos días.
--  * Puntaje de pago 0–100 (solo señales objetivas): mora, antigüedad y tiempo sin abonar.
--  * Recordatorios en 3 niveles (1, 7 y 15 días después del vencimiento). Se registra cada envío para no repetir.

alter table organizaciones add column if not exists dias_credito integer not null default 30 check (dias_credito between 0 and 365);

create table recordatorios_cobro (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  cliente_id uuid not null references clientes(id),
  nivel integer not null check (nivel between 1 and 3),
  saldo numeric(14,2) not null,
  enviado_en timestamptz not null default now()
);
create index on recordatorios_cobro (cliente_id, nivel, enviado_en desc);
alter table recordatorios_cobro enable row level security;
create policy recordatorios_leer on recordatorios_cobro for select
  using (tiene_rol(organizacion_id, array['dueno','admin','contador']::rol_miembro[]));

-- Cálculo común (sin chequeo de rol; las funciones públicas lo hacen).
create or replace function calcular_cartera(p_org uuid, p_cliente uuid default null)
returns table (cliente_id uuid, nombre text, telefono text, acepta_mensajes boolean, saldo numeric, cupo numeric,
               vencido numeric, dias_mora integer, dias_deuda integer, ultimo_abono date, puntaje integer, categoria text)
language sql stable security definer set search_path = public as $$
  with params as (select dias_credito as dc, (now() at time zone 'America/Bogota')::date as hoy from organizaciones where id = p_org),
  cli as (
    select c.* from clientes c where c.organizacion_id = p_org and c.saldo > 0 and (p_cliente is null or c.id = p_cliente)
  ),
  entradas as (
    select v.cliente_id, (v.creado_en at time zone 'America/Bogota')::date as fecha, pv.monto, v.creado_en as orden
      from pagos_venta pv join ventas v on v.id = pv.venta_id
     where v.organizacion_id = p_org and v.estado = 'confirmado' and pv.metodo = 'credito' and v.cliente_id in (select id from cli)
    union all
    select a.cliente_id, (a.creado_en at time zone 'America/Bogota')::date, a.monto, a.creado_en
      from ajustes_cartera a where a.organizacion_id = p_org and a.monto > 0 and a.cliente_id in (select id from cli)
  ),
  acum as (
    select e.cliente_id, e.fecha, e.monto, c.saldo,
           sum(e.monto) over (partition by e.cliente_id order by e.orden desc rows between unbounded preceding and current row) as acum_nuevo
      from entradas e join cli c on c.id = e.cliente_id
  ),
  pendiente as (
    select cliente_id, fecha, greatest(least(monto, saldo - (acum_nuevo - monto)), 0) as resto from acum
  ),
  resumen as (
    select p.cliente_id,
           coalesce(sum(p.resto) filter (where p.fecha < (select hoy - dc from params)), 0) as vencido,
           min(p.fecha) filter (where p.resto > 0) as mas_vieja
      from pendiente p group by p.cliente_id
  ),
  base as (
    select c.id, c.nombre, c.telefono, c.acepta_mensajes, c.saldo, c.cupo_credito,
           coalesce(r.vencido, 0)::numeric(14,2) as vencido,
           case when r.mas_vieja is null then 0 else (select hoy from params) - r.mas_vieja end as dias_deuda,
           (select max((a.creado_en at time zone 'America/Bogota')::date) from abonos_cliente a where a.cliente_id = c.id) as ult_abono
      from cli c left join resumen r on r.cliente_id = c.id
  )
  select x.cliente_id, x.nombre, x.telefono, x.acepta_mensajes, x.saldo, x.cupo, x.vencido, x.dias_mora, x.dias_deuda, x.ult_abono, x.puntaje,
         case when x.puntaje >= 70 then 'bueno' when x.puntaje >= 40 then 'regular' else 'malo' end
    from (
      select b.id as cliente_id, b.nombre, b.telefono, b.acepta_mensajes, b.saldo, b.cupo_credito as cupo, b.vencido,
             greatest(b.dias_deuda - (select dc from params), 0)::integer as dias_mora,
             b.dias_deuda::integer as dias_deuda,
             b.ult_abono,
             greatest(0, least(100, round(
               100
               - 50 * (b.vencido / nullif(b.saldo, 0))
               - case when b.dias_deuda > 90 then 30 when b.dias_deuda > 60 then 20 when b.dias_deuda > 30 then 10 else 0 end
               - case when b.dias_deuda > 30 and (b.ult_abono is null or b.ult_abono < (select hoy from params) - 45) then 10 else 0 end
               - case when b.cupo_credito > 0 and b.saldo > b.cupo_credito then 10 else 0 end
             )))::integer as puntaje
        from base b
    ) x
$$;

create or replace function cartera_clientes(p_org uuid)
returns table (cliente_id uuid, nombre text, telefono text, saldo numeric, cupo numeric, vencido numeric, dias_mora integer,
               dias_deuda integer, ultimo_abono date, puntaje integer, categoria text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','vendedor','ruta','contador']::rol_miembro[]) then raise exception 'Sin permiso para ver la cartera'; end if;
  return query
  select c.cliente_id, c.nombre, c.telefono, c.saldo, c.cupo, c.vencido, c.dias_mora, c.dias_deuda, c.ultimo_abono, c.puntaje, c.categoria
    from calcular_cartera(p_org) c
   order by c.vencido desc, c.saldo desc;
end $$;

-- Puntaje de UN cliente (el POS lo consulta antes de fiar). Sin deuda = bueno.
create or replace function puntaje_cliente(p_cliente uuid)
returns table (puntaje integer, categoria text, saldo numeric, vencido numeric, dias_mora integer)
language plpgsql stable security definer set search_path = public as $$
declare org uuid;
begin
  select organizacion_id into org from clientes where id = p_cliente;
  if org is null or org not in (select mis_organizaciones()) then raise exception 'Cliente no existe'; end if;
  if not tiene_rol(org, array['dueno','admin','vendedor','ruta','contador']::rol_miembro[]) then raise exception 'Sin permiso'; end if;
  return query
  select c.puntaje, c.categoria, c.saldo, c.vencido, c.dias_mora
    from calcular_cartera(org, p_cliente) c;
  if not found then return query select 100, 'bueno', 0::numeric, 0::numeric, 0; end if;
end $$;

-- Para n8n (service_role): clientes a los que toca recordar hoy y con qué nivel.
create or replace function recordatorios_pendientes()
returns table (organizacion_id uuid, organizacion text, cliente_id uuid, cliente text, telefono text, saldo numeric, vencido numeric,
               dias_mora integer, nivel integer)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
  select o.id, o.nombre, c.cliente_id, c.nombre, c.telefono, c.saldo, c.vencido, c.dias_mora,
         case
           when c.dias_mora >= 15 and not exists (select 1 from recordatorios_cobro r where r.cliente_id = c.cliente_id and r.nivel = 3 and r.enviado_en > now() - interval '30 days') then 3
           when c.dias_mora >= 7 and not exists (select 1 from recordatorios_cobro r where r.cliente_id = c.cliente_id and r.nivel >= 2 and r.enviado_en > now() - interval '30 days') then 2
           when c.dias_mora >= 1 and not exists (select 1 from recordatorios_cobro r where r.cliente_id = c.cliente_id and r.enviado_en > now() - interval '30 days') then 1
         end
    from organizaciones o
    cross join lateral calcular_cartera(o.id) c
   where c.acepta_mensajes and c.telefono is not null and c.vencido > 0 and c.dias_mora >= 1
     and exists (select 1 from ventas v where v.organizacion_id = o.id and v.creado_en > now() - interval '60 days')
     and (case
           when c.dias_mora >= 15 and not exists (select 1 from recordatorios_cobro r where r.cliente_id = c.cliente_id and r.nivel = 3 and r.enviado_en > now() - interval '30 days') then 3
           when c.dias_mora >= 7 and not exists (select 1 from recordatorios_cobro r where r.cliente_id = c.cliente_id and r.nivel >= 2 and r.enviado_en > now() - interval '30 days') then 2
           when c.dias_mora >= 1 and not exists (select 1 from recordatorios_cobro r where r.cliente_id = c.cliente_id and r.enviado_en > now() - interval '30 days') then 1
         end) is not null
   order by o.nombre, c.vencido desc;
end $$;

create or replace function registrar_recordatorio(p_cliente uuid, p_nivel integer, p_saldo numeric) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  select organizacion_id into org from clientes where id = p_cliente;
  if org is null then raise exception 'Cliente no existe'; end if;
  insert into recordatorios_cobro (organizacion_id, cliente_id, nivel, saldo) values (org, p_cliente, p_nivel, p_saldo);
end $$;

revoke all on function calcular_cartera(uuid, uuid) from public, anon, authenticated;
revoke all on function cartera_clientes(uuid) from public, anon;
revoke all on function puntaje_cliente(uuid) from public, anon;
revoke all on function recordatorios_pendientes() from public, anon, authenticated;
revoke all on function registrar_recordatorio(uuid, integer, numeric) from public, anon, authenticated;
grant execute on function cartera_clientes(uuid) to authenticated;
grant execute on function puntaje_cliente(uuid) to authenticated;
grant execute on function recordatorios_pendientes() to service_role;
grant execute on function registrar_recordatorio(uuid, integer, numeric) to service_role;
