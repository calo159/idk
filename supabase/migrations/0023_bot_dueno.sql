-- 0023: bot de WhatsApp del dueño (Fase 3: 3.4)
-- El bot recibe mensajes por n8n y responde consultas o registra gastos. Reglas de seguridad:
--  * Solo números de dueños/administradores registrados (miembros.telefono) o el WhatsApp de alertas del negocio.
--  * Todo lo que escribe datos pasa por una confirmación ("SÍ"): la IA propone, la persona confirma.
--  * Un mismo mensaje de WhatsApp (reenvíos de Meta) nunca se procesa dos veces.
-- Todas las funciones son SOLO para service_role.

create table bot_pendientes (
  telefono text primary key,
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  usuario_id uuid not null references auth.users(id),
  accion jsonb not null,
  expira_en timestamptz not null default now() + interval '10 minutes'
);
alter table bot_pendientes enable row level security; -- sin políticas: nadie lo lee desde la app

create table bot_mensajes (
  mensaje_id text primary key,
  organizacion_id uuid references organizaciones(id) on delete cascade,
  creado_en timestamptz not null default now()
);
alter table bot_mensajes enable row level security;

-- ¿Quién escribe? Devuelve el negocio y la persona autorizada, o nada.
create or replace function bot_resolver(p_telefono text)
returns table (organizacion_id uuid, organizacion text, usuario_id uuid, nombre text, rol rol_miembro)
language sql stable security definer set search_path = public as $$
  with tel as (select right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10) as t)
  select m.organizacion_id, o.nombre, m.usuario_id, m.nombre, m.rol
    from miembros m join organizaciones o on o.id = m.organizacion_id, tel
   where length(tel.t) = 10 and m.activo and m.rol in ('dueno', 'admin')
     and (right(regexp_replace(coalesce(m.telefono, ''), '\D', '', 'g'), 10) = tel.t
          or (m.rol = 'dueno' and right(regexp_replace(coalesce(o.telefono_whatsapp, ''), '\D', '', 'g'), 10) = tel.t))
   order by (m.rol = 'dueno') desc, m.creado_en
   limit 1
$$;

-- Marca un mensaje como visto. Devuelve false si ya se había procesado.
create or replace function bot_registrar_mensaje(p_mensaje text, p_org uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from bot_mensajes where creado_en < now() - interval '2 days';
  insert into bot_mensajes (mensaje_id, organizacion_id) values (p_mensaje, p_org);
  return true;
exception when unique_violation then
  return false;
end $$;

create or replace function bot_guardar_pendiente(p_telefono text, p_org uuid, p_usuario uuid, p_accion jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into bot_pendientes (telefono, organizacion_id, usuario_id, accion, expira_en)
  values (right(regexp_replace(p_telefono, '\D', '', 'g'), 10), p_org, p_usuario, p_accion, now() + interval '10 minutes')
  on conflict (telefono) do update set organizacion_id = excluded.organizacion_id, usuario_id = excluded.usuario_id,
         accion = excluded.accion, expira_en = excluded.expira_en;
end $$;

-- Toma (y borra) la acción pendiente si no venció.
create or replace function bot_tomar_pendiente(p_telefono text)
returns table (organizacion_id uuid, usuario_id uuid, accion jsonb)
language plpgsql security definer set search_path = public as $$
declare t text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10);
begin
  return query
  delete from bot_pendientes b where b.telefono = t and b.expira_en > now()
  returning b.organizacion_id, b.usuario_id, b.accion;
  delete from bot_pendientes where telefono = t and expira_en <= now();
end $$;

-- Registra un gasto a nombre del dueño/admin que lo pidió por WhatsApp. No es efectivo de caja (no hay turno).
create or replace function registrar_gasto_bot(p_org uuid, p_usuario uuid, p_categoria text, p_descripcion text, p_monto numeric, p_metodo metodo_pago)
returns uuid
language plpgsql security definer set search_path = public as $$
declare nuevo uuid;
begin
  if not exists (select 1 from miembros where organizacion_id = p_org and usuario_id = p_usuario and activo and rol in ('dueno','admin')) then
    raise exception 'Solo el dueño o un administrador registran gastos por WhatsApp';
  end if;
  if coalesce(trim(p_categoria), '') = '' or coalesce(trim(p_descripcion), '') = '' then raise exception 'La categoría y la descripción son obligatorias'; end if;
  if p_monto is null or p_monto <= 0 or p_monto > 999999999 then raise exception 'El monto no es válido'; end if;
  if p_metodo = 'credito' then raise exception 'Un gasto no puede ser a crédito'; end if;
  insert into gastos (organizacion_id, categoria, descripcion, monto, metodo, usuario_id)
  values (p_org, trim(p_categoria), trim(p_descripcion), p_monto, p_metodo, p_usuario) returning id into nuevo;
  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (p_org, 'gastos', nuevo::text, 'crear', jsonb_build_object('monto', p_monto, 'categoria', p_categoria, 'origen', 'whatsapp'), p_usuario);
  return nuevo;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'bot_resolver(text)', 'bot_registrar_mensaje(text,uuid)', 'bot_guardar_pendiente(text,uuid,uuid,jsonb)',
    'bot_tomar_pendiente(text)', 'registrar_gasto_bot(uuid,uuid,text,text,numeric,metodo_pago)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
