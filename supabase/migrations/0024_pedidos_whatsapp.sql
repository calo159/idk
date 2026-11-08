-- 0024: pedidos de clientes por WhatsApp (Fase 3: 3.5)
-- El cliente escribe lo que quiere; la IA/reglas lo convierten en un pedido pendiente (carrito preparado, NO una venta).
-- El negocio lo revisa en el panel y lo vende desde el POS; al venderse se avisa al cliente con el total.
-- Nada de lo que escribe un cliente toca inventario, caja ni cartera sin que una persona del negocio lo confirme.

alter table organizaciones add column if not exists whatsapp_phone_number_id text unique;

create table pedidos_whatsapp (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  mensaje_id text not null unique,
  telefono text not null,
  cliente_id uuid references clientes(id),
  texto text not null,
  lineas jsonb not null default '[]'::jsonb,       -- [{producto_id, presentacion_id, nombre, cantidad, precio}]
  no_encontrados jsonb not null default '[]'::jsonb, -- [{descripcion, cantidad}] que no se pudieron emparejar
  estado text not null default 'pendiente' check (estado in ('pendiente','confirmado','rechazado')),
  venta_id uuid references ventas(id),
  motivo text,
  creado_en timestamptz not null default now()
);
create index on pedidos_whatsapp (organizacion_id, estado, creado_en desc);
alter table pedidos_whatsapp enable row level security;
create policy pedidos_whatsapp_leer on pedidos_whatsapp for select
  using (tiene_rol(organizacion_id, array['dueno','admin','vendedor','ruta']::rol_miembro[]));
create trigger trg_misma_org before insert or update on pedidos_whatsapp
  for each row execute function exigir_misma_organizacion('cliente_id:clientes', 'venta_id:ventas');

-- ¿A qué negocio le escribieron? (n8n envía el ID del número de WhatsApp Business que recibió el mensaje)
create or replace function org_por_numero_whatsapp(p_phone_number_id text)
returns table (organizacion_id uuid, organizacion text)
language sql stable security definer set search_path = public as $$
  select id, nombre from organizaciones where whatsapp_phone_number_id = nullif(trim(p_phone_number_id), '')
$$;

-- Registra el pedido (idempotente por ID de mensaje) y avisa al dueño.
create or replace function registrar_pedido_whatsapp(p_org uuid, p_mensaje_id text, p_telefono text, p_texto text, p_lineas jsonb, p_no_encontrados jsonb)
returns table (pedido_id uuid, nuevo boolean, cliente_id uuid)
language plpgsql security definer set search_path = public as $$
declare tel text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10); cli uuid; nuevo_id uuid;
begin
  if length(tel) <> 10 then raise exception 'Teléfono inválido'; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_typeof(p_no_encontrados) <> 'array' then raise exception 'Datos del pedido inválidos'; end if;
  if jsonb_array_length(p_lineas) + jsonb_array_length(p_no_encontrados) = 0 then raise exception 'El pedido está vacío'; end if;
  select id into cli from clientes where organizacion_id = p_org and right(regexp_replace(coalesce(telefono, ''), '\D', '', 'g'), 10) = tel limit 1;

  select id into nuevo_id from pedidos_whatsapp where mensaje_id = p_mensaje_id;
  if nuevo_id is not null then
    return query select nuevo_id, false, cli;
    return;
  end if;
  insert into pedidos_whatsapp (organizacion_id, mensaje_id, telefono, cliente_id, texto, lineas, no_encontrados)
  values (p_org, p_mensaje_id, tel, cli, left(p_texto, 2000), p_lineas, p_no_encontrados) returning id into nuevo_id;
  insert into eventos_outbox (organizacion_id, tipo, payload)
  values (p_org, 'pedido.nuevo', jsonb_build_object('pedido_id', nuevo_id, 'productos', jsonb_array_length(p_lineas),
          'sin_emparejar', jsonb_array_length(p_no_encontrados), 'cliente_conocido', cli is not null));
  return query select nuevo_id, true, cli;
end $$;

-- Desde el panel: rechazar o confirmar (al venderse). Al confirmar se avisa al cliente con el total.
create or replace function resolver_pedido_whatsapp(p_pedido uuid, p_estado text, p_venta uuid default null, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare pe pedidos_whatsapp%rowtype; v ventas%rowtype;
begin
  select * into pe from pedidos_whatsapp where id = p_pedido for update;
  if not found or pe.organizacion_id not in (select mis_organizaciones()) then raise exception 'Pedido no existe'; end if;
  if not tiene_rol(pe.organizacion_id, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then raise exception 'Sin permiso'; end if;
  if pe.estado <> 'pendiente' then raise exception 'El pedido ya fue %', pe.estado; end if;
  if p_estado = 'confirmado' then
    select * into v from ventas where id = p_venta and organizacion_id = pe.organizacion_id and estado = 'confirmado';
    if not found then raise exception 'La venta del pedido no es válida'; end if;
    update pedidos_whatsapp set estado = 'confirmado', venta_id = v.id where id = pe.id;
    insert into eventos_outbox (organizacion_id, tipo, payload)
    values (pe.organizacion_id, 'pedido.confirmado', jsonb_build_object('pedido_id', pe.id, 'telefono_cliente', pe.telefono, 'total', v.total, 'numero', v.numero));
  elsif p_estado = 'rechazado' then
    if coalesce(trim(p_motivo), '') = '' then raise exception 'El motivo es obligatorio'; end if;
    update pedidos_whatsapp set estado = 'rechazado', motivo = trim(p_motivo) where id = pe.id;
    insert into eventos_outbox (organizacion_id, tipo, payload)
    values (pe.organizacion_id, 'pedido.rechazado', jsonb_build_object('pedido_id', pe.id, 'telefono_cliente', pe.telefono, 'motivo', trim(p_motivo)));
  else
    raise exception 'Estado inválido';
  end if;
end $$;

revoke all on function org_por_numero_whatsapp(text) from public, anon, authenticated;
revoke all on function registrar_pedido_whatsapp(uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function org_por_numero_whatsapp(text) to service_role;
grant execute on function registrar_pedido_whatsapp(uuid, text, text, text, jsonb, jsonb) to service_role;
revoke all on function resolver_pedido_whatsapp(uuid, text, uuid, text) from public, anon;
grant execute on function resolver_pedido_whatsapp(uuid, text, uuid, text) to authenticated;
