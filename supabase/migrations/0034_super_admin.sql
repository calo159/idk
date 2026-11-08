-- 0034: panel de super-admin (Fase 4: 4.2) — clientes, uso y soporte.
--
--  * Un super-admin es alguien del equipo de Surtix (no de un negocio). Se agrega SOLO por SQL/consola:
--      insert into super_admins (usuario_id) values ('<uuid del usuario>');
--    La tabla no tiene políticas: nadie puede leerla ni escribirla desde la API.
--  * Ve QUÉ negocios hay, su plan, estado y uso (conteos). NO ve clientes, precios, ventas ni deudas de los negocios,
--    y no puede entrar como ellos (no hay «suplantar usuario»).
--  * Cada acción de soporte (cambiar plan, extender, suspender, registrar un pago manual) exige un motivo y queda en `admin_acciones`.

create table super_admins (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  creado_en timestamptz not null default now()
);
alter table super_admins enable row level security; -- sin políticas a propósito

create table admin_acciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  accion text not null,
  motivo text not null,
  detalle jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now()
);
create index on admin_acciones (organizacion_id, creado_en desc);
alter table admin_acciones enable row level security; -- sin políticas: solo se lee con admin_detalle_negocio

create or replace function es_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from super_admins where usuario_id = auth.uid())
$$;

create or replace function exigir_super_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not es_super_admin() then raise exception 'Solo el equipo de Surtix puede hacer esto'; end if;
end $$;

-- Cifras globales para la cabecera del panel.
create or replace function admin_metricas() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  perform exigir_super_admin();
  select jsonb_build_object(
    'negocios', count(*),
    'en_prueba', count(*) filter (where estado_de_suscripcion(s) = 'prueba'),
    'activos', count(*) filter (where estado_de_suscripcion(s) = 'activa'),
    'en_gracia', count(*) filter (where estado_de_suscripcion(s) = 'gracia'),
    'vencidos', count(*) filter (where estado_de_suscripcion(s) = 'vencida'),
    'suspendidos', count(*) filter (where estado_de_suscripcion(s) = 'suspendida'),
    'nuevos_30d', count(*) filter (where o.creado_en > now() - interval '30 days'),
    -- Ingreso mensual recurrente aproximado: precio mensual de cada suscripción pagada y vigente.
    'mrr', coalesce(sum(p.precio_mensual) filter (where estado_de_suscripcion(s) = 'activa'), 0)
  ) into r
  from organizaciones o join suscripciones s on s.organizacion_id = o.id join planes p on p.codigo = s.plan;
  return r;
end $$;

create or replace function admin_listar_negocios(p_buscar text default null, p_limite integer default 100)
returns table (id uuid, nombre text, nicho text, ciudad text, creado_en timestamptz, plan text, estado text, vigente_hasta timestamptz,
               usuarios integer, ventas_30d integer, ultima_venta timestamptz, dueno text, correo_dueno text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform exigir_super_admin();
  return query
  select o.id, o.nombre, o.nicho, o.ciudad, o.creado_en, s.plan, estado_de_suscripcion(s),
         greatest(coalesce(s.periodo_hasta, '-infinity'), coalesce(s.prueba_hasta, '-infinity')),
         (select count(*) from miembros m where m.organizacion_id = o.id and m.activo)::integer,
         (select count(*) from ventas v where v.organizacion_id = o.id and v.estado = 'confirmado' and v.creado_en > now() - interval '30 days')::integer,
         (select max(v.creado_en) from ventas v where v.organizacion_id = o.id and v.estado = 'confirmado'),
         (select m.nombre from miembros m where m.organizacion_id = o.id and m.rol = 'dueno' order by m.creado_en limit 1),
         (select u.email::text from miembros m join auth.users u on u.id = m.usuario_id where m.organizacion_id = o.id and m.rol = 'dueno' order by m.creado_en limit 1)
    from organizaciones o join suscripciones s on s.organizacion_id = o.id
   where p_buscar is null or trim(p_buscar) = '' or o.nombre ilike '%' || trim(p_buscar) || '%'
      or exists (select 1 from miembros m join auth.users u on u.id = m.usuario_id where m.organizacion_id = o.id and u.email::text ilike '%' || trim(p_buscar) || '%')
   order by o.creado_en desc
   limit least(greatest(p_limite, 1), 500);
end $$;

-- Vista de soporte de un negocio: estado, pagos, equipo y conteos. Sin datos comerciales.
create or replace function admin_detalle_negocio(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  perform exigir_super_admin();
  select jsonb_build_object(
    'negocio', jsonb_build_object('id', o.id, 'nombre', o.nombre, 'nicho', o.nicho, 'ciudad', o.ciudad, 'nit', o.nit, 'creado_en', o.creado_en),
    'suscripcion', (select to_jsonb(x) from mi_suscripcion_interna(o.id) x),
    'miembros', coalesce((select jsonb_agg(jsonb_build_object('nombre', m.nombre, 'rol', m.rol, 'activo', m.activo, 'correo', u.email) order by m.creado_en)
                            from miembros m join auth.users u on u.id = m.usuario_id where m.organizacion_id = o.id), '[]'::jsonb),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('referencia', x.referencia, 'plan', x.plan, 'meses', x.meses, 'monto', x.monto, 'estado', x.estado, 'creado_en', x.creado_en) order by x.creado_en desc)
                         from (select * from pagos_suscripcion p where p.organizacion_id = o.id order by p.creado_en desc limit 10) x), '[]'::jsonb),
    'uso', jsonb_build_object(
      'productos', (select count(*) from productos where organizacion_id = o.id),
      'clientes', (select count(*) from clientes where organizacion_id = o.id),
      'ventas_total', (select count(*) from ventas where organizacion_id = o.id and estado = 'confirmado'),
      'ventas_30d', (select count(*) from ventas where organizacion_id = o.id and estado = 'confirmado' and creado_en > now() - interval '30 days'),
      'ultima_venta', (select max(creado_en) from ventas where organizacion_id = o.id and estado = 'confirmado')),
    'acciones', coalesce((select jsonb_agg(jsonb_build_object('accion', a.accion, 'motivo', a.motivo, 'detalle', a.detalle, 'creado_en', a.creado_en) order by a.creado_en desc)
                            from (select * from admin_acciones x where x.organizacion_id = o.id order by x.creado_en desc limit 20) a), '[]'::jsonb)
  ) into r from organizaciones o where o.id = p_org;
  if r is null then raise exception 'Negocio no existe'; end if;
  return r;
end $$;

-- mi_suscripcion sin la verificación de pertenencia (la usan funciones que ya validaron quién llama).
create or replace function mi_suscripcion_interna(p_org uuid)
returns table (plan text, plan_nombre text, estado text, vigente_hasta timestamptz, dias_restantes integer, precio_mensual numeric,
               max_usuarios integer, max_bodegas integer, usuarios integer, bodegas integer, motivo_suspension text)
language sql stable security definer set search_path = public as $$
  select s.plan, p.nombre, estado_de_suscripcion(s),
         greatest(coalesce(s.periodo_hasta, '-infinity'), coalesce(s.prueba_hasta, '-infinity')),
         greatest(ceil(extract(epoch from (greatest(coalesce(s.periodo_hasta, '-infinity'), coalesce(s.prueba_hasta, '-infinity')) - now())) / 86400)::integer, 0),
         p.precio_mensual, p.max_usuarios, p.max_bodegas,
         (select count(*) from miembros m where m.organizacion_id = p_org and m.activo)::integer,
         (select count(*) from bodegas b where b.organizacion_id = p_org)::integer,
         s.motivo_suspension
    from suscripciones s join planes p on p.codigo = s.plan where s.organizacion_id = p_org;
$$;

create or replace function registrar_accion_admin(p_org uuid, p_accion text, p_motivo text, p_detalle jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe el motivo (mínimo 3 letras)'; end if;
  insert into admin_acciones (usuario_id, organizacion_id, accion, motivo, detalle) values (auth.uid(), p_org, p_accion, trim(p_motivo), coalesce(p_detalle, '{}'::jsonb));
end $$;

create or replace function admin_cambiar_plan(p_org uuid, p_plan text, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare antes text;
begin
  perform exigir_super_admin();
  if not exists (select 1 from planes where codigo = p_plan) then raise exception 'Ese plan no existe'; end if;
  select plan into antes from suscripciones where organizacion_id = p_org for update;
  if antes is null then raise exception 'Negocio no existe'; end if;
  perform registrar_accion_admin(p_org, 'cambiar_plan', p_motivo, jsonb_build_object('antes', antes, 'despues', p_plan));
  update suscripciones set plan = p_plan, actualizado_en = now() where organizacion_id = p_org;
end $$;

-- Regala días (soporte, cortesías, compensaciones). Se suman a lo que ya tenía, pagado o de prueba.
create or replace function admin_extender_suscripcion(p_org uuid, p_dias integer, p_motivo text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare base timestamptz; nueva timestamptz;
begin
  perform exigir_super_admin();
  if p_dias is null or p_dias < 1 or p_dias > 365 then raise exception 'Los días deben estar entre 1 y 365'; end if;
  select greatest(now(), coalesce(periodo_hasta, now()), coalesce(prueba_hasta, now())) into base from suscripciones where organizacion_id = p_org for update;
  if base is null then raise exception 'Negocio no existe'; end if;
  nueva := base + p_dias * interval '1 day';
  perform registrar_accion_admin(p_org, 'extender', p_motivo, jsonb_build_object('dias', p_dias, 'hasta', nueva));
  update suscripciones set periodo_hasta = nueva, actualizado_en = now() where organizacion_id = p_org;
  return nueva;
end $$;

create or replace function admin_suspender(p_org uuid, p_suspender boolean, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_super_admin();
  if not exists (select 1 from suscripciones where organizacion_id = p_org) then raise exception 'Negocio no existe'; end if;
  perform registrar_accion_admin(p_org, case when p_suspender then 'suspender' else 'reactivar' end, p_motivo, '{}'::jsonb);
  update suscripciones set suspendida = p_suspender, motivo_suspension = case when p_suspender then trim(p_motivo) end, actualizado_en = now() where organizacion_id = p_org;
end $$;

-- Pago hecho por fuera de Wompi (transferencia, efectivo): queda como pago aprobado con referencia MAN-… y activa el plan.
create or replace function admin_registrar_pago_manual(p_org uuid, p_plan text, p_meses integer, p_monto numeric, p_motivo text) returns text
language plpgsql security definer set search_path = public as $$
declare pl planes; ref text; r text;
begin
  perform exigir_super_admin();
  select * into pl from planes where codigo = p_plan;
  if pl.codigo is null then raise exception 'Ese plan no existe'; end if;
  if p_meses not in (1, 3, 6, 12) then raise exception 'Elige 1, 3, 6 o 12 meses'; end if;
  if p_monto is null or p_monto < 0 then raise exception 'Monto inválido'; end if;
  if not exists (select 1 from suscripciones where organizacion_id = p_org) then raise exception 'Negocio no existe'; end if;
  perform registrar_accion_admin(p_org, 'pago_manual', p_motivo, jsonb_build_object('plan', p_plan, 'meses', p_meses, 'monto', p_monto));
  ref := 'MAN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  insert into pagos_suscripcion (organizacion_id, plan, meses, monto, referencia, proveedor, creado_por) values (p_org, p_plan, p_meses, p_monto, ref, 'manual', auth.uid());
  r := aplicar_pago_suscripcion(ref, 'manual', 'aprobado', p_monto, jsonb_build_object('manual', true));
  return ref;
end $$;

do $$
declare f text;
begin
  foreach f in array array['exigir_super_admin()', 'registrar_accion_admin(uuid,text,text,jsonb)', 'mi_suscripcion_interna(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['es_super_admin()', 'admin_metricas()', 'admin_listar_negocios(text,integer)', 'admin_detalle_negocio(uuid)',
                           'admin_cambiar_plan(uuid,text,text)', 'admin_extender_suscripcion(uuid,integer,text)', 'admin_suspender(uuid,boolean,text)',
                           'admin_registrar_pago_manual(uuid,text,integer,numeric,text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
