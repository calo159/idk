-- 0033: planes y cobro de suscripción (Fase 4: 4.1).
--
--  * Todo negocio nuevo empieza con 14 días de prueba del plan «negocio» (sin tarjeta).
--  * Estado de la suscripción (se calcula, no se guarda): prueba → activa (pagó) → gracia (5 días tras vencer) → vencida.
--    Mientras está en prueba, activa o en gracia se trabaja normal; vencida bloquea las pantallas del negocio y deja solo la de pago.
--    Los datos NUNCA se borran por falta de pago.
--  * El cobro lo hace Wompi (checkout externo + webhook firmado). El pago se aplica con `aplicar_pago_suscripcion`,
--    idempotente por referencia: un reintento del webhook no regala dos meses.
--  * PRECIOS PROVISIONALES: se editan en la tabla `planes` sin tocar código.

create table planes (
  codigo text primary key check (codigo ~ '^[a-z]+$'),
  nombre text not null,
  descripcion text,
  precio_mensual numeric(14,2) not null check (precio_mensual >= 0),
  max_usuarios integer check (max_usuarios is null or max_usuarios > 0), -- null = sin límite
  max_bodegas integer check (max_bodegas is null or max_bodegas > 0),
  orden integer not null default 0,
  activo boolean not null default true
);
alter table planes enable row level security;
create policy planes_leer on planes for select to authenticated using (activo);

insert into planes (codigo, nombre, descripcion, precio_mensual, max_usuarios, max_bodegas, orden) values
  ('inicio', 'Inicio', 'Para un negocio pequeño con una caja: inventario, ventas, compras y fiados.', 39900, 2, 1, 1),
  ('negocio', 'Negocio', 'El más completo para una tienda con equipo: WhatsApp, IA, rutas y catálogo.', 79900, 6, 2, 2),
  ('crecimiento', 'Crecimiento', 'Varias sedes y vendedores de ruta, sin límite práctico de usuarios.', 149900, null, 6, 3);

create table suscripciones (
  organizacion_id uuid primary key references organizaciones(id) on delete cascade,
  plan text not null references planes(codigo),
  prueba_hasta timestamptz,
  periodo_hasta timestamptz,
  suspendida boolean not null default false,
  motivo_suspension text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table suscripciones enable row level security;
create policy suscripciones_leer on suscripciones for select using (organizacion_id in (select mis_organizaciones()));

create table pagos_suscripcion (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  plan text not null references planes(codigo),
  meses integer not null check (meses in (1, 3, 6, 12)),
  monto numeric(14,2) not null check (monto >= 0),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado', 'revision')),
  proveedor text not null default 'wompi',
  referencia text not null unique,
  transaccion_id text,
  respuesta jsonb,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  aprobado_en timestamptz
);
create index on pagos_suscripcion (organizacion_id, creado_en desc);
alter table pagos_suscripcion enable row level security;
create policy pagos_suscripcion_leer on pagos_suscripcion for select
  using (tiene_rol(organizacion_id, array['dueno','admin','contador']::rol_miembro[]));

-- Prueba automática para cada negocio nuevo (y para los que ya existían).
create or replace function crear_suscripcion_de_prueba() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into suscripciones (organizacion_id, plan, prueba_hasta) values (new.id, 'negocio', now() + interval '14 days')
  on conflict do nothing;
  return new;
end $$;
create trigger organizaciones_suscripcion after insert on organizaciones
  for each row execute function crear_suscripcion_de_prueba();
insert into suscripciones (organizacion_id, plan, prueba_hasta) select id, 'negocio', now() + interval '14 days' from organizaciones on conflict do nothing;

-- Estado vigente. Única fuente de verdad: la app solo lo lee.
create or replace function estado_de_suscripcion(s suscripciones) returns text
language sql stable as $$
  select case
    when s.suspendida then 'suspendida'
    when s.periodo_hasta > now() then 'activa'
    when s.prueba_hasta > now() then 'prueba'
    when now() <= greatest(coalesce(s.periodo_hasta, '-infinity'), coalesce(s.prueba_hasta, '-infinity')) + interval '5 days' then 'gracia'
    else 'vencida'
  end
$$;

create or replace function mi_suscripcion(p_org uuid)
returns table (plan text, plan_nombre text, estado text, vigente_hasta timestamptz, dias_restantes integer, precio_mensual numeric,
               max_usuarios integer, max_bodegas integer, usuarios integer, bodegas integer, motivo_suspension text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_org not in (select mis_organizaciones()) then raise exception 'Sin acceso'; end if;
  return query
  select s.plan, p.nombre, estado_de_suscripcion(s),
         greatest(coalesce(s.periodo_hasta, '-infinity'), coalesce(s.prueba_hasta, '-infinity')),
         greatest(ceil(extract(epoch from (greatest(coalesce(s.periodo_hasta, '-infinity'), coalesce(s.prueba_hasta, '-infinity')) - now())) / 86400)::integer, 0),
         p.precio_mensual, p.max_usuarios, p.max_bodegas,
         (select count(*) from miembros m where m.organizacion_id = p_org and m.activo)::integer,
         (select count(*) from bodegas b where b.organizacion_id = p_org)::integer,
         s.motivo_suspension
    from suscripciones s join planes p on p.codigo = s.plan
   where s.organizacion_id = p_org;
end $$;

-- El dueño o admin pide pagar: se crea el pago pendiente con una referencia única que viaja a Wompi.
create or replace function iniciar_pago_suscripcion(p_org uuid, p_plan text, p_meses integer default 1)
returns table (referencia text, monto numeric, plan_nombre text)
language plpgsql security definer set search_path = public as $$
declare pl planes; ref text; total numeric;
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin pagan la suscripción'; end if;
  select * into pl from planes where codigo = p_plan and activo;
  if pl.codigo is null then raise exception 'Ese plan no existe'; end if;
  if p_meses not in (1, 3, 6, 12) then raise exception 'Elige 1, 3, 6 o 12 meses'; end if;
  if (select count(*) from pagos_suscripcion x where x.organizacion_id = p_org and x.estado = 'pendiente' and x.creado_en > now() - interval '1 hour') >= 10 then
    raise exception 'Hay muchos pagos pendientes, intenta en un rato';
  end if;
  -- Bajar de plan solo si el negocio cabe en los límites del nuevo.
  if pl.max_usuarios is not null and (select count(*) from miembros m where m.organizacion_id = p_org and m.activo) > pl.max_usuarios then
    raise exception 'Tienes más usuarios de los que permite el plan %', pl.nombre;
  end if;
  if pl.max_bodegas is not null and (select count(*) from bodegas b where b.organizacion_id = p_org) > pl.max_bodegas then
    raise exception 'Tienes más bodegas de las que permite el plan %', pl.nombre;
  end if;
  ref := 'SUR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  total := pl.precio_mensual * p_meses;
  insert into pagos_suscripcion (organizacion_id, plan, meses, monto, referencia, creado_por) values (p_org, pl.codigo, p_meses, total, ref, auth.uid());
  return query select ref, total, pl.nombre;
end $$;

-- Para el webhook (service_role): aplica el resultado de Wompi. Idempotente por referencia.
create or replace function aplicar_pago_suscripcion(p_referencia text, p_transaccion_id text, p_estado text, p_monto numeric, p_respuesta jsonb)
returns text
language plpgsql security definer set search_path = public as $$
declare pg pagos_suscripcion; base timestamptz;
begin
  select * into pg from pagos_suscripcion where referencia = p_referencia for update;
  if pg.id is null then return 'desconocido'; end if;
  if pg.estado = 'aprobado' then return 'ya_aplicado'; end if;
  if p_estado <> 'aprobado' then
    update pagos_suscripcion set estado = 'rechazado', transaccion_id = coalesce(p_transaccion_id, transaccion_id), respuesta = p_respuesta where id = pg.id;
    return 'rechazado';
  end if;
  -- Un pago aprobado por un monto distinto al esperado no activa nada: queda para revisión humana.
  if p_monto is distinct from pg.monto then
    update pagos_suscripcion set estado = 'revision', transaccion_id = coalesce(p_transaccion_id, transaccion_id), respuesta = p_respuesta where id = pg.id;
    return 'monto_distinto';
  end if;
  update pagos_suscripcion set estado = 'aprobado', transaccion_id = p_transaccion_id, respuesta = p_respuesta, aprobado_en = now() where id = pg.id;
  -- El nuevo periodo empieza donde termina lo que ya tenía (prueba o pago anterior): no se pierden días.
  select greatest(now(), coalesce(periodo_hasta, now()), coalesce(prueba_hasta, now())) into base from suscripciones where organizacion_id = pg.organizacion_id;
  update suscripciones set plan = pg.plan, periodo_hasta = base + (pg.meses * 30) * interval '1 day', suspendida = false, motivo_suspension = null, actualizado_en = now()
   where organizacion_id = pg.organizacion_id;
  return 'aplicado';
end $$;

-- Límites del plan: los hace cumplir la base de datos para que ninguna pantalla pueda saltárselos.
create or replace function exigir_limite_usuarios() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl planes; ocupados integer;
begin
  select p.* into pl from suscripciones s join planes p on p.codigo = s.plan where s.organizacion_id = new.organizacion_id;
  if pl.max_usuarios is null then return new; end if;
  select (select count(*) from miembros m where m.organizacion_id = new.organizacion_id and m.activo)
       + (select count(*) from invitaciones i where i.organizacion_id = new.organizacion_id and i.aceptada_en is null and i.expira_en > now())
    into ocupados;
  if ocupados >= pl.max_usuarios then
    raise exception 'Tu plan % permite hasta % usuarios. Mejora tu plan para invitar a más personas.', pl.nombre, pl.max_usuarios;
  end if;
  return new;
end $$;
create trigger invitaciones_limite_plan before insert on invitaciones for each row execute function exigir_limite_usuarios();

create or replace function exigir_limite_bodegas() returns trigger
language plpgsql security definer set search_path = public as $$
declare pl planes;
begin
  select p.* into pl from suscripciones s join planes p on p.codigo = s.plan where s.organizacion_id = new.organizacion_id;
  if pl.max_bodegas is null then return new; end if;
  if (select count(*) from bodegas b where b.organizacion_id = new.organizacion_id) >= pl.max_bodegas then
    raise exception 'Tu plan % permite hasta % bodegas. Mejora tu plan para abrir otra sede.', pl.nombre, pl.max_bodegas;
  end if;
  return new;
end $$;
create trigger bodegas_limite_plan before insert on bodegas for each row execute function exigir_limite_bodegas();

do $$
declare f text;
begin
  foreach f in array array['crear_suscripcion_de_prueba()', 'estado_de_suscripcion(suscripciones)', 'exigir_limite_usuarios()', 'exigir_limite_bodegas()', 'aplicar_pago_suscripcion(text,text,text,numeric,jsonb)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  grant execute on function aplicar_pago_suscripcion(text, text, text, numeric, jsonb) to service_role;
  foreach f in array array['mi_suscripcion(uuid)', 'iniciar_pago_suscripcion(uuid,text,integer)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
