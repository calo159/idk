-- 0038: compras en grupo y portal del distribuidor (Fase 4: 4.6).
--
-- Un distribuidor publica una oferta con ESCALAS de precio por volumen TOTAL (entre todos los negocios que se unan).
-- Los negocios se comprometen con una cantidad; mientras más se junten, más baja el precio para todos. Al cerrar:
--   * si el total alcanzó la primera escala → la oferta queda «cerrada» con el precio de la escala alcanzada,
--   * si no → «cancelada» y nadie compra nada.
--
-- AISLAMIENTO ENTRE NEGOCIOS (esto es lo delicado de esta migración):
--   * Un negocio ve las ofertas abiertas, el TOTAL comprometido y su propio compromiso. Nunca quién más se unió.
--   * El distribuidor ve, de cada negocio que se unió a SUS ofertas, solo nombre, ciudad, WhatsApp y cantidad: lo necesario para entregar.
--     Nunca ve ventas, inventario, clientes ni otras ofertas del negocio.
--   * Los distribuidores los da de alta el equipo de Surtix (admin_crear_distribuidor); no hay registro libre.
--   * Todo pasa por funciones; las tablas de ofertas no se escriben desde la API.

create table distribuidores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 2 and 120),
  nit text,
  telefono text,
  activo boolean not null default true,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create table distribuidor_usuarios (
  distribuidor_id uuid not null references distribuidores(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  primary key (distribuidor_id, usuario_id)
);

create or replace function es_de_distribuidor(d uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from distribuidor_usuarios u join distribuidores x on x.id = u.distribuidor_id
                  where u.usuario_id = auth.uid() and u.distribuidor_id = d and x.activo)
$$;

create table ofertas_grupales (
  id uuid primary key default gen_random_uuid(),
  distribuidor_id uuid not null references distribuidores(id) on delete cascade,
  titulo text not null check (char_length(titulo) between 3 and 120),
  descripcion text check (descripcion is null or char_length(descripcion) <= 500),
  unidad text not null default 'unidad' check (char_length(unidad) between 1 and 30),
  precio_referencia numeric(14,2) not null check (precio_referencia > 0),
  cierra_en date not null,
  entrega_estimada date,
  minimo_negocio numeric(14,3) not null default 1 check (minimo_negocio > 0),
  maximo_negocio numeric(14,3) check (maximo_negocio is null or maximo_negocio >= minimo_negocio),
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada', 'cancelada', 'entregada')),
  precio_final numeric(14,2),
  total_final numeric(14,3),
  cerrada_en timestamptz,
  creado_en timestamptz not null default now()
);
create index on ofertas_grupales (estado, cierra_en);
create index on ofertas_grupales (distribuidor_id, creado_en desc);

create table ofertas_escalas (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references ofertas_grupales(id) on delete cascade,
  cantidad_desde numeric(14,3) not null check (cantidad_desde > 0),
  precio_unitario numeric(14,2) not null check (precio_unitario > 0),
  unique (oferta_id, cantidad_desde)
);

create table compromisos_grupales (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references ofertas_grupales(id) on delete cascade,
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  cantidad numeric(14,3) not null check (cantidad > 0),
  orden_compra_id uuid references ordenes_compra(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (oferta_id, organizacion_id)
);
create index on compromisos_grupales (organizacion_id, creado_en desc);

alter table distribuidores enable row level security;
alter table distribuidor_usuarios enable row level security;
alter table ofertas_grupales enable row level security;
alter table ofertas_escalas enable row level security;
alter table compromisos_grupales enable row level security;
create policy distribuidores_leer on distribuidores for select using (es_de_distribuidor(id));
create policy distribuidor_usuarios_leer on distribuidor_usuarios for select using (usuario_id = auth.uid());
create policy ofertas_distribuidor_leer on ofertas_grupales for select using (es_de_distribuidor(distribuidor_id));
create policy escalas_distribuidor_leer on ofertas_escalas for select
  using (exists (select 1 from ofertas_grupales o where o.id = oferta_id and es_de_distribuidor(o.distribuidor_id)));
-- Un negocio solo ve SUS compromisos (el distribuidor los ve únicamente con compromisos_de_oferta).
create policy compromisos_leer on compromisos_grupales for select
  using (tiene_rol(organizacion_id, array['dueno','admin','bodeguero']::rol_miembro[]));

-- ---------------------------------------------------------------------
-- Alta de distribuidores (solo equipo de Surtix)
-- ---------------------------------------------------------------------
create or replace function admin_crear_distribuidor(p_nombre text, p_nit text, p_telefono text, p_correo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare u uuid; d uuid;
begin
  perform exigir_super_admin();
  select id into u from auth.users where lower(email::text) = lower(trim(p_correo));
  if u is null then raise exception 'Ese correo aún no tiene cuenta: pídele a la persona que se registre primero'; end if;
  insert into distribuidores (nombre, nit, telefono, creado_por) values (trim(p_nombre), nullif(trim(p_nit), ''), nullif(trim(p_telefono), ''), auth.uid()) returning id into d;
  insert into distribuidor_usuarios (distribuidor_id, usuario_id) values (d, u);
  return d;
end $$;

create or replace function admin_agregar_usuario_distribuidor(p_distribuidor uuid, p_correo text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  perform exigir_super_admin();
  select id into u from auth.users where lower(email::text) = lower(trim(p_correo));
  if u is null then raise exception 'Ese correo aún no tiene cuenta: pídele a la persona que se registre primero'; end if;
  if not exists (select 1 from distribuidores where id = p_distribuidor) then raise exception 'Distribuidor no existe'; end if;
  insert into distribuidor_usuarios (distribuidor_id, usuario_id) values (p_distribuidor, u) on conflict do nothing;
end $$;

create or replace function mis_distribuidores() returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select d.id, d.nombre from distribuidores d join distribuidor_usuarios u on u.distribuidor_id = d.id where u.usuario_id = auth.uid() and d.activo order by d.nombre
$$;

-- ---------------------------------------------------------------------
-- Distribuidor: publicar, cerrar, cancelar, entregar
-- ---------------------------------------------------------------------
create or replace function crear_oferta_grupal(p_distribuidor uuid, p_titulo text, p_descripcion text, p_unidad text, p_precio_referencia numeric,
  p_cierra_en date, p_entrega date, p_minimo_negocio numeric, p_maximo_negocio numeric, p_escalas jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare hoy date := (now() at time zone 'America/Bogota')::date; nueva uuid; e jsonb; anterior_cant numeric := 0; anterior_precio numeric; n integer;
begin
  if not es_de_distribuidor(p_distribuidor) then raise exception 'No tienes permiso en este distribuidor'; end if;
  if p_cierra_en is null or p_cierra_en <= hoy or p_cierra_en > hoy + 60 then raise exception 'La oferta debe cerrar entre mañana y 60 días'; end if;
  if p_entrega is not null and p_entrega < p_cierra_en then raise exception 'La entrega no puede ser antes del cierre'; end if;
  if jsonb_typeof(p_escalas) <> 'array' or jsonb_array_length(p_escalas) not between 1 and 6 then raise exception 'Define de 1 a 6 escalas de precio'; end if;
  insert into ofertas_grupales (distribuidor_id, titulo, descripcion, unidad, precio_referencia, cierra_en, entrega_estimada, minimo_negocio, maximo_negocio)
  values (p_distribuidor, trim(p_titulo), nullif(trim(coalesce(p_descripcion, '')), ''), coalesce(nullif(trim(p_unidad), ''), 'unidad'), p_precio_referencia, p_cierra_en, p_entrega,
          coalesce(p_minimo_negocio, 1), p_maximo_negocio)
  returning id into nueva;
  -- Las escalas deben ir de menos a más cantidad y de más a menos precio, todas por debajo del precio de referencia.
  for e in select * from jsonb_array_elements(p_escalas) order by (value ->> 'cantidad_desde')::numeric loop
    if (e ->> 'cantidad_desde')::numeric <= anterior_cant then raise exception 'Las cantidades de las escalas deben ser distintas y crecientes'; end if;
    if (e ->> 'precio_unitario')::numeric >= p_precio_referencia then raise exception 'Cada precio de grupo debe ser menor al precio normal'; end if;
    if anterior_precio is not null and (e ->> 'precio_unitario')::numeric >= anterior_precio then raise exception 'A mayor cantidad el precio debe bajar'; end if;
    insert into ofertas_escalas (oferta_id, cantidad_desde, precio_unitario) values (nueva, (e ->> 'cantidad_desde')::numeric, (e ->> 'precio_unitario')::numeric);
    anterior_cant := (e ->> 'cantidad_desde')::numeric;
    anterior_precio := (e ->> 'precio_unitario')::numeric;
  end loop;
  select count(*) into n from ofertas_escalas where oferta_id = nueva;
  if n = 0 then raise exception 'Define de 1 a 6 escalas de precio'; end if;
  return nueva;
exception when check_violation then
  raise exception 'Revisa los datos de la oferta (título, precios y cantidades)';
end $$;

-- Precio por unidad que corresponde a un total comprometido (null si todavía no se llega a la primera escala).
create or replace function precio_de_oferta(p_oferta uuid, p_total numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select precio_unitario from ofertas_escalas where oferta_id = p_oferta and cantidad_desde <= p_total order by cantidad_desde desc limit 1
$$;

create or replace function cerrar_oferta_grupal(p_oferta uuid) returns text
language plpgsql security definer set search_path = public as $$
declare o ofertas_grupales; total numeric; precio numeric; c record; msg text;
begin
  select * into o from ofertas_grupales where id = p_oferta for update;
  if o.id is null or not es_de_distribuidor(o.distribuidor_id) then raise exception 'Oferta no existe'; end if;
  if o.estado <> 'abierta' then raise exception 'La oferta ya no está abierta'; end if;
  select coalesce(sum(cantidad), 0) into total from compromisos_grupales where oferta_id = p_oferta;
  precio := precio_de_oferta(p_oferta, total);
  if precio is null then
    update ofertas_grupales set estado = 'cancelada', total_final = total, cerrada_en = now() where id = p_oferta;
    msg := format('La compra grupal «%s» se canceló: no se juntó la cantidad mínima. No tienes que pagar nada.', o.titulo);
  else
    update ofertas_grupales set estado = 'cerrada', precio_final = precio, total_final = total, cerrada_en = now() where id = p_oferta;
  end if;
  for c in select organizacion_id, cantidad from compromisos_grupales where oferta_id = p_oferta loop
    perform crear_alerta_unica(c.organizacion_id, 'compra_grupal', p_oferta::text || '-cierre', case when precio is null then 'baja' else 'media' end,
      -- Pesos con punto de miles ($ 8.500) sin depender de la configuración regional del servidor.
      coalesce(msg, format('La compra grupal «%s» se cerró: pagas $ %s por %s unidades (total $ %s). El distribuidor te contactará para la entrega.',
        o.titulo, replace(to_char(precio, 'FM999,999,999,990'), ',', '.'), trim_scale(c.cantidad), replace(to_char(precio * c.cantidad, 'FM999,999,999,990'), ',', '.'))),
      jsonb_build_object('oferta_id', p_oferta, 'precio', precio));
  end loop;
  return case when precio is null then 'cancelada' else 'cerrada' end;
end $$;

create or replace function cancelar_oferta_grupal(p_oferta uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare o ofertas_grupales; c record;
begin
  select * into o from ofertas_grupales where id = p_oferta for update;
  if o.id is null or not es_de_distribuidor(o.distribuidor_id) then raise exception 'Oferta no existe'; end if;
  if o.estado <> 'abierta' then raise exception 'La oferta ya no está abierta'; end if;
  if char_length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe el motivo de la cancelación'; end if;
  update ofertas_grupales set estado = 'cancelada', cerrada_en = now() where id = p_oferta;
  for c in select organizacion_id from compromisos_grupales where oferta_id = p_oferta loop
    perform crear_alerta_unica(c.organizacion_id, 'compra_grupal', p_oferta::text || '-cierre', 'baja',
      format('El distribuidor canceló la compra grupal «%s»: %s. No tienes que pagar nada.', o.titulo, trim(p_motivo)), jsonb_build_object('oferta_id', p_oferta));
  end loop;
end $$;

create or replace function entregar_oferta_grupal(p_oferta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o ofertas_grupales;
begin
  select * into o from ofertas_grupales where id = p_oferta for update;
  if o.id is null or not es_de_distribuidor(o.distribuidor_id) then raise exception 'Oferta no existe'; end if;
  if o.estado <> 'cerrada' then raise exception 'Solo se marca como entregada una oferta cerrada'; end if;
  update ofertas_grupales set estado = 'entregada' where id = p_oferta;
end $$;

-- El distribuidor ve a quién entregar: lo mínimo de cada negocio que se unió A SUS ofertas.
create or replace function compromisos_de_oferta(p_oferta uuid)
returns table (negocio text, ciudad text, whatsapp text, cantidad numeric, total_a_pagar numeric)
language plpgsql stable security definer set search_path = public as $$
declare o ofertas_grupales;
begin
  select * into o from ofertas_grupales where id = p_oferta;
  if o.id is null or not es_de_distribuidor(o.distribuidor_id) then raise exception 'Oferta no existe'; end if;
  return query
  select g.nombre, g.ciudad, g.telefono_whatsapp, c.cantidad, case when o.precio_final is null then null else (o.precio_final * c.cantidad)::numeric(14,2) end
    from compromisos_grupales c join organizaciones g on g.id = c.organizacion_id
   where c.oferta_id = p_oferta order by c.creado_en;
end $$;

-- ---------------------------------------------------------------------
-- Negocios: ver ofertas, unirse, retirarse, convertir en orden de compra
-- ---------------------------------------------------------------------
create or replace function ofertas_abiertas(p_org uuid)
returns table (oferta_id uuid, distribuidor text, titulo text, descripcion text, unidad text, precio_referencia numeric, cierra_en date, entrega_estimada date,
               minimo_negocio numeric, maximo_negocio numeric, total_comprometido numeric, negocios integer, precio_actual numeric, escalas jsonb, mi_cantidad numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero']::rol_miembro[]) then raise exception 'Sin permiso para ver las compras en grupo'; end if;
  return query
  select o.id, d.nombre, o.titulo, o.descripcion, o.unidad, o.precio_referencia, o.cierra_en, o.entrega_estimada, o.minimo_negocio, o.maximo_negocio,
         coalesce(t.total, 0), coalesce(t.n, 0)::integer, precio_de_oferta(o.id, coalesce(t.total, 0)),
         (select jsonb_agg(jsonb_build_object('desde', e.cantidad_desde, 'precio', e.precio_unitario) order by e.cantidad_desde) from ofertas_escalas e where e.oferta_id = o.id),
         (select c.cantidad from compromisos_grupales c where c.oferta_id = o.id and c.organizacion_id = p_org)
    from ofertas_grupales o join distribuidores d on d.id = o.distribuidor_id and d.activo
    left join lateral (select sum(c.cantidad) as total, count(*) as n from compromisos_grupales c where c.oferta_id = o.id) t on true
   where o.estado = 'abierta' and o.cierra_en >= (now() at time zone 'America/Bogota')::date
   order by o.cierra_en, o.titulo;
end $$;

create or replace function comprometer_compra_grupal(p_org uuid, p_oferta uuid, p_cantidad numeric) returns void
language plpgsql security definer set search_path = public as $$
declare o ofertas_grupales;
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin se comprometen a una compra'; end if;
  select * into o from ofertas_grupales where id = p_oferta for update;
  if o.id is null or o.estado <> 'abierta' or o.cierra_en < (now() at time zone 'America/Bogota')::date then raise exception 'La oferta ya no está abierta'; end if;
  if not exists (select 1 from distribuidores where id = o.distribuidor_id and activo) then raise exception 'La oferta ya no está abierta'; end if;
  if p_cantidad is null or p_cantidad < o.minimo_negocio then raise exception 'La cantidad mínima por negocio es %', o.minimo_negocio; end if;
  if o.maximo_negocio is not null and p_cantidad > o.maximo_negocio then raise exception 'La cantidad máxima por negocio es %', o.maximo_negocio; end if;
  insert into compromisos_grupales (oferta_id, organizacion_id, cantidad) values (p_oferta, p_org, p_cantidad)
  on conflict (oferta_id, organizacion_id) do update set cantidad = excluded.cantidad, actualizado_en = now();
end $$;

create or replace function retirar_compromiso_grupal(p_org uuid, p_oferta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o ofertas_grupales;
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin se retiran de una compra'; end if;
  select * into o from ofertas_grupales where id = p_oferta for update;
  if o.id is null or o.estado <> 'abierta' then raise exception 'Ya no puedes retirarte: la oferta se cerró'; end if;
  delete from compromisos_grupales where oferta_id = p_oferta and organizacion_id = p_org;
end $$;

create or replace function mis_compras_grupales(p_org uuid)
returns table (oferta_id uuid, distribuidor text, titulo text, unidad text, estado text, cantidad numeric, precio_final numeric, total_a_pagar numeric,
               entrega_estimada date, orden_compra_id uuid, cierra_en date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero']::rol_miembro[]) then raise exception 'Sin permiso para ver las compras en grupo'; end if;
  return query
  select o.id, d.nombre, o.titulo, o.unidad, o.estado, c.cantidad, o.precio_final, case when o.precio_final is null then null else (o.precio_final * c.cantidad)::numeric(14,2) end,
         o.entrega_estimada, c.orden_compra_id, o.cierra_en
    from compromisos_grupales c join ofertas_grupales o on o.id = c.oferta_id join distribuidores d on d.id = o.distribuidor_id
   where c.organizacion_id = p_org order by c.creado_en desc;
end $$;

-- Convierte una compra grupal cerrada en una orden de compra en borrador (con el distribuidor como proveedor).
create or replace function crear_orden_desde_oferta(p_org uuid, p_oferta uuid, p_producto uuid, p_bodega uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o ofertas_grupales; c compromisos_grupales; d distribuidores; prov uuid; oc uuid;
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero']::rol_miembro[]) then raise exception 'Sin permiso para crear órdenes de compra'; end if;
  select * into c from compromisos_grupales where oferta_id = p_oferta and organizacion_id = p_org for update;
  if c.id is null then raise exception 'Tu negocio no participó en esta compra'; end if;
  select * into o from ofertas_grupales where id = p_oferta;
  if o.estado not in ('cerrada', 'entregada') then raise exception 'La compra grupal aún no se ha cerrado con precio'; end if;
  if c.orden_compra_id is not null then return c.orden_compra_id; end if;     -- una sola orden por compromiso
  if not exists (select 1 from productos where id = p_producto and organizacion_id = p_org and activo) then raise exception 'Producto no existe'; end if;
  select * into d from distribuidores where id = o.distribuidor_id;
  select id into prov from proveedores where organizacion_id = p_org and lower(nombre) = lower(d.nombre) and activo limit 1;
  if prov is null then
    insert into proveedores (organizacion_id, nombre, nit, telefono) values (p_org, d.nombre, d.nit, d.telefono) returning id into prov;
  end if;
  oc := crear_orden_compra(p_org, prov, p_bodega,
          jsonb_build_array(jsonb_build_object('producto_id', p_producto, 'cantidad', c.cantidad, 'costo', o.precio_final)),
          o.entrega_estimada, format('Compra en grupo: %s', o.titulo));
  update compromisos_grupales set orden_compra_id = oc where id = c.id;
  return oc;
end $$;

do $$
declare f text;
begin
  foreach f in array array['precio_de_oferta(uuid,numeric)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'es_de_distribuidor(uuid)', 'mis_distribuidores()', 'admin_crear_distribuidor(text,text,text,text)', 'admin_agregar_usuario_distribuidor(uuid,text)',
    'crear_oferta_grupal(uuid,text,text,text,numeric,date,date,numeric,numeric,jsonb)', 'cerrar_oferta_grupal(uuid)', 'cancelar_oferta_grupal(uuid,text)',
    'entregar_oferta_grupal(uuid)', 'compromisos_de_oferta(uuid)', 'ofertas_abiertas(uuid)', 'comprometer_compra_grupal(uuid,uuid,numeric)',
    'retirar_compromiso_grupal(uuid,uuid)', 'mis_compras_grupales(uuid)', 'crear_orden_desde_oferta(uuid,uuid,uuid,uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
