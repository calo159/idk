-- 0036: programa de referidos (Fase 4: 4.4).
--
--  * Cada negocio tiene un código (SURT-XXXXXX). Quien se registra con ese código queda como «referido».
--  * La recompensa llega solo cuando el referido PAGA por primera vez (no por registrarse): 30 días gratis para los dos.
--  * Protecciones: no vale referirse a uno mismo ni entre negocios de las mismas personas, el código se aplica una sola vez
--    y en los primeros 30 días, y un negocio gana como máximo 12 meses gratis al año por referidos.

alter table organizaciones add column if not exists codigo_referido text unique;

create or replace function generar_codigo_referido() returns text
language plpgsql as $$
declare alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i integer;
begin
  loop
    c := 'SURT-';
    for i in 1..6 loop c := c || substr(alfabeto, 1 + floor(random() * length(alfabeto))::integer, 1); end loop;
    exit when not exists (select 1 from organizaciones where codigo_referido = c);
  end loop;
  return c;
end $$;

create or replace function asignar_codigo_referido() returns trigger
language plpgsql as $$
begin
  if new.codigo_referido is null then new.codigo_referido := generar_codigo_referido(); end if;
  return new;
end $$;
create trigger organizaciones_codigo_referido before insert on organizaciones
  for each row execute function asignar_codigo_referido();
update organizaciones set codigo_referido = generar_codigo_referido() where codigo_referido is null;

create table referidos (
  id uuid primary key default gen_random_uuid(),
  referidor_org uuid not null references organizaciones(id) on delete cascade,
  referido_org uuid not null unique references organizaciones(id) on delete cascade,
  estado text not null default 'registrado' check (estado in ('registrado', 'convertido')),
  dias_referidor integer not null default 0,
  dias_referido integer not null default 0,
  creado_en timestamptz not null default now(),
  convertido_en timestamptz,
  check (referidor_org <> referido_org)
);
create index on referidos (referidor_org, creado_en desc);
alter table referidos enable row level security;
create policy referidos_leer on referidos for select
  using (tiene_rol(referidor_org, array['dueno','admin']::rol_miembro[]) or tiene_rol(referido_org, array['dueno','admin']::rol_miembro[]));

-- Aplica un código a un negocio recién creado. Devuelve un texto para que la pantalla explique qué pasó (sin lanzar errores).
create or replace function aplicar_codigo_referido(p_org uuid, p_codigo text) returns text
language plpgsql security definer set search_path = public as $$
declare referidor uuid; creado timestamptz; codigo text := upper(trim(coalesce(p_codigo, '')));
begin
  if not tiene_rol(p_org, array['dueno']::rol_miembro[]) then raise exception 'Solo el dueño puede usar un código de referido'; end if;
  select creado_en into creado from organizaciones where id = p_org;
  if exists (select 1 from referidos where referido_org = p_org) then return 'ya_usado'; end if;
  if creado < now() - interval '30 days' then return 'vencido'; end if;
  if exists (select 1 from pagos_suscripcion where organizacion_id = p_org and estado = 'aprobado') then return 'ya_pago'; end if;
  select id into referidor from organizaciones where codigo_referido = codigo;
  if referidor is null then return 'codigo_invalido'; end if;
  if referidor = p_org then return 'no_permitido'; end if;
  -- Dos negocios que comparten a una misma persona no se pueden referir entre sí.
  if exists (select 1 from miembros a join miembros b on b.usuario_id = a.usuario_id
              where a.organizacion_id = p_org and b.organizacion_id = referidor and a.activo and b.activo) then
    return 'no_permitido';
  end if;
  insert into referidos (referidor_org, referido_org) values (referidor, p_org);
  return 'ok';
end $$;

create or replace function mis_referidos(p_org uuid)
returns table (negocio text, estado text, dias_ganados integer, creado_en timestamptz, convertido_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Sin permiso'; end if;
  return query
  select o.nombre, r.estado, r.dias_referidor, r.creado_en, r.convertido_en
    from referidos r join organizaciones o on o.id = r.referido_org
   where r.referidor_org = p_org order by r.creado_en desc;
end $$;

-- Igual que en 0033 + la recompensa por el primer pago del referido.
create or replace function aplicar_pago_suscripcion(p_referencia text, p_transaccion_id text, p_estado text, p_monto numeric, p_respuesta jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare pg pagos_suscripcion; base timestamptz; ref referidos; dias_a integer; ganados_12m integer; nombre_referido text;
begin
  select * into pg from pagos_suscripcion where referencia = p_referencia for update;
  if pg.id is null then return 'desconocido'; end if;
  if pg.estado = 'aprobado' then return 'ya_aplicado'; end if;
  if p_estado <> 'aprobado' then
    update pagos_suscripcion set estado = 'rechazado', transaccion_id = coalesce(p_transaccion_id, transaccion_id), respuesta = p_respuesta where id = pg.id;
    return 'rechazado';
  end if;
  if p_monto is distinct from pg.monto then
    update pagos_suscripcion set estado = 'revision', transaccion_id = coalesce(p_transaccion_id, transaccion_id), respuesta = p_respuesta where id = pg.id;
    return 'monto_distinto';
  end if;
  update pagos_suscripcion set estado = 'aprobado', transaccion_id = p_transaccion_id, respuesta = p_respuesta, aprobado_en = now() where id = pg.id;
  select greatest(now(), coalesce(periodo_hasta, now()), coalesce(prueba_hasta, now())) into base from suscripciones where organizacion_id = pg.organizacion_id;
  update suscripciones set plan = pg.plan, periodo_hasta = base + (pg.meses * 30) * interval '1 day', suspendida = false, motivo_suspension = null, actualizado_en = now()
   where organizacion_id = pg.organizacion_id;

  -- Referidos: el primer pago con dinero de verdad convierte la recomendación y premia a las dos partes.
  if pg.monto > 0 then
    select * into ref from referidos where referido_org = pg.organizacion_id and estado = 'registrado' for update;
    if ref.id is not null then
      select coalesce(sum(dias_referidor), 0) into ganados_12m from referidos where referidor_org = ref.referidor_org and estado = 'convertido' and convertido_en > now() - interval '365 days';
      dias_a := case when ganados_12m >= 360 then 0 else 30 end;
      update referidos set estado = 'convertido', convertido_en = now(), dias_referidor = dias_a, dias_referido = 30 where id = ref.id;
      update suscripciones set periodo_hasta = periodo_hasta + interval '30 days', actualizado_en = now() where organizacion_id = pg.organizacion_id;
      if dias_a > 0 then
        update suscripciones set periodo_hasta = greatest(now(), coalesce(periodo_hasta, now()), coalesce(prueba_hasta, now())) + (dias_a * interval '1 day'), actualizado_en = now()
         where organizacion_id = ref.referidor_org;
        select nombre into nombre_referido from organizaciones where id = pg.organizacion_id;
        perform crear_alerta_unica(ref.referidor_org, 'referido_convertido', ref.id::text, 'baja',
          format('¡%s pagó su suscripción! Ganaste %s días gratis por recomendarnos.', nombre_referido, dias_a), jsonb_build_object('referido_org', pg.organizacion_id, 'dias', dias_a));
      end if;
    end if;
  end if;
  return 'aplicado';
end $$;

revoke all on function generar_codigo_referido() from public, anon, authenticated;
revoke all on function asignar_codigo_referido() from public, anon, authenticated;
revoke all on function aplicar_pago_suscripcion(text, text, text, numeric, jsonb) from public, anon, authenticated;
grant execute on function aplicar_pago_suscripcion(text, text, text, numeric, jsonb) to service_role;
do $$
declare f text;
begin
  foreach f in array array['aplicar_codigo_referido(uuid,text)', 'mis_referidos(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
