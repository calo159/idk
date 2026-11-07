-- =====================================================================
-- Surtix — Esquema inicial (MVP)
-- Inventario por movimientos, multi-tenant con RLS, compras, ventas,
-- pagos con verificación de comprobantes, caja, cartera, auditoría y outbox.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type rol_miembro as enum ('dueno','admin','vendedor','bodeguero','contador','ruta');
create type estado_documento as enum ('borrador','confirmado','anulado');
create type tipo_movimiento as enum (
  'inicial','compra','venta','ajuste_entrada','ajuste_salida',
  'traslado_entrada','traslado_salida','devolucion_cliente','devolucion_proveedor',
  'anulacion_entrada','anulacion_salida'
);
create type metodo_pago as enum ('efectivo','nequi','daviplata','transferencia','tarjeta','credito','otro');
create type estado_verificacion as enum ('no_aplica','sin_verificar','verificado_ia','verificado_manual','sospechoso');
create type estado_turno as enum ('abierto','cerrado');

-- ---------------------------------------------------------------------
-- Organizaciones y miembros
-- ---------------------------------------------------------------------
create table organizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  nit text,
  nicho text not null default 'general',           -- ferreteria, ropa, viveres, veterinaria, general
  telefono_whatsapp text,
  ciudad text default 'Riohacha',
  permite_stock_negativo boolean not null default true,
  umbral_ajuste_alerta numeric(14,2) not null default 100000,
  plan text not null default 'prueba',
  creado_en timestamptz not null default now()
);

create table miembros (
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  rol rol_miembro not null,
  nombre text not null,
  telefono text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  primary key (organizacion_id, usuario_id)
);

-- Funciones de seguridad (security definer para no recursar en RLS)
create or replace function mis_organizaciones() returns setof uuid
language sql stable security definer set search_path = public as $$
  select organizacion_id from miembros where usuario_id = auth.uid() and activo
$$;

create or replace function tiene_rol(org uuid, roles rol_miembro[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from miembros
    where organizacion_id = org and usuario_id = auth.uid() and activo and rol = any(roles)
  )
$$;

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
create table bodegas (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  nombre text not null,
  es_principal boolean not null default false,
  activa boolean not null default true
);

create table categorias (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  nombre text not null,
  padre_id uuid references categorias(id),
  unique (organizacion_id, nombre)
);

create table productos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  categoria_id uuid references categorias(id),
  sku text,
  codigo_barras text,
  nombre text not null,
  descripcion text,
  unidad_base text not null default 'unidad',      -- unidad, metro, kilo, litro...
  precio_venta numeric(14,2) not null default 0 check (precio_venta >= 0),
  margen_objetivo numeric(5,2),                    -- % para precios automáticos (fase 3)
  stock_minimo numeric(14,3) not null default 0,
  maneja_inventario boolean not null default true, -- false para servicios
  foto_url text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (organizacion_id, sku),
  unique (organizacion_id, codigo_barras)
);
create index on productos (organizacion_id, nombre);

-- Presentaciones: caja x12, paquete, metro... (factor respecto a la unidad base)
create table presentaciones (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete cascade,
  nombre text not null,
  factor numeric(14,3) not null check (factor > 0),
  codigo_barras text,
  precio_venta numeric(14,2) not null check (precio_venta >= 0),
  unique (organizacion_id, codigo_barras)
);

-- ---------------------------------------------------------------------
-- Inventario
-- ---------------------------------------------------------------------
create table existencias (
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete cascade,
  bodega_id uuid not null references bodegas(id) on delete cascade,
  cantidad numeric(14,3) not null default 0,
  costo_promedio numeric(14,2) not null default 0,
  actualizado_en timestamptz not null default now(),
  primary key (producto_id, bodega_id)
);

create table movimientos_inventario (
  id bigint generated always as identity primary key,
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  producto_id uuid not null references productos(id),
  bodega_id uuid not null references bodegas(id),
  tipo tipo_movimiento not null,
  cantidad numeric(14,3) not null check (cantidad > 0),   -- siempre positiva, el tipo da el signo
  costo_unitario numeric(14,2) not null default 0,         -- costo de entrada o costo promedio a la salida
  saldo_cantidad numeric(14,3),                            -- saldo después del movimiento (kardex)
  saldo_costo_promedio numeric(14,2),
  documento_tipo text,                                     -- 'venta','compra','ajuste','traslado'
  documento_id uuid,
  motivo text,
  usuario_id uuid references auth.users(id),
  offline_id uuid,
  creado_en timestamptz not null default now()
);
create index on movimientos_inventario (organizacion_id, producto_id, creado_en);
create index on movimientos_inventario (documento_tipo, documento_id);

create or replace function signo_movimiento(t tipo_movimiento) returns int
language sql immutable as $$
  select case when t in ('inicial','compra','ajuste_entrada','traslado_entrada',
                         'devolucion_cliente','anulacion_entrada') then 1 else -1 end
$$;

-- Aplica el movimiento a existencias, calcula costo promedio y saldo (kardex)
create or replace function aplicar_movimiento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ex existencias%rowtype;
  s int := signo_movimiento(new.tipo);
  nueva_cant numeric(14,3);
  nuevo_costo numeric(14,2);
  permite boolean;
begin
  insert into existencias (organizacion_id, producto_id, bodega_id)
  values (new.organizacion_id, new.producto_id, new.bodega_id)
  on conflict (producto_id, bodega_id) do nothing;

  select * into ex from existencias
   where producto_id = new.producto_id and bodega_id = new.bodega_id
   for update;

  nueva_cant := ex.cantidad + s * new.cantidad;

  if s = 1 and new.tipo <> 'anulacion_entrada' and new.costo_unitario > 0 then
    if ex.cantidad <= 0 then
      nuevo_costo := new.costo_unitario;
    else
      nuevo_costo := round((ex.cantidad * ex.costo_promedio + new.cantidad * new.costo_unitario) / nueva_cant, 2);
    end if;
  else
    nuevo_costo := ex.costo_promedio;
    if s = -1 then
      new.costo_unitario := ex.costo_promedio;   -- las salidas valen al costo promedio vigente
    end if;
  end if;

  if nueva_cant < 0 then
    select permite_stock_negativo into permite from organizaciones where id = new.organizacion_id;
    if not permite then
      raise exception 'Stock insuficiente para el producto % (disponible %, solicitado %)',
        new.producto_id, ex.cantidad, new.cantidad using errcode = 'P0001';
    end if;
    insert into eventos_outbox (organizacion_id, tipo, payload)
    values (new.organizacion_id, 'stock.negativo',
            jsonb_build_object('producto_id', new.producto_id, 'bodega_id', new.bodega_id, 'cantidad', nueva_cant));
  end if;

  update existencias
     set cantidad = nueva_cant, costo_promedio = nuevo_costo, actualizado_en = now()
   where producto_id = new.producto_id and bodega_id = new.bodega_id;

  new.saldo_cantidad := nueva_cant;
  new.saldo_costo_promedio := nuevo_costo;
  return new;
end $$;

create trigger trg_aplicar_movimiento
before insert on movimientos_inventario
for each row execute function aplicar_movimiento();

-- Movimientos inmutables
create or replace function bloquear_cambios() returns trigger
language plpgsql as $$
begin
  raise exception 'Los movimientos de inventario no se modifican ni se borran: crea un movimiento contrario';
end $$;

create trigger trg_movimientos_inmutables
before update or delete on movimientos_inventario
for each row execute function bloquear_cambios();

-- Alerta de stock bajo
create or replace function alerta_stock_bajo() returns trigger
language plpgsql security definer set search_path = public as $$
declare minimo numeric(14,3);
begin
  select stock_minimo into minimo from productos where id = new.producto_id;
  if minimo > 0 and new.cantidad <= minimo and old.cantidad > minimo then
    insert into eventos_outbox (organizacion_id, tipo, payload)
    values (new.organizacion_id, 'stock.bajo',
            jsonb_build_object('producto_id', new.producto_id, 'bodega_id', new.bodega_id,
                               'cantidad', new.cantidad, 'minimo', minimo));
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Terceros
-- ---------------------------------------------------------------------
create table proveedores (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  nombre text not null,
  nit text,
  telefono text,
  contacto text,
  activo boolean not null default true
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  nombre text not null,
  documento text,
  telefono text,
  fecha_nacimiento date,
  cupo_credito numeric(14,2) not null default 0,
  saldo numeric(14,2) not null default 0,          -- lo mantiene la lógica de ventas/abonos
  acepta_mensajes boolean not null default true,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (organizacion_id, telefono)
);

-- ---------------------------------------------------------------------
-- Caja
-- ---------------------------------------------------------------------
create table turnos_caja (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  bodega_id uuid not null references bodegas(id),
  usuario_id uuid not null references auth.users(id),
  estado estado_turno not null default 'abierto',
  base_inicial numeric(14,2) not null default 0,
  efectivo_esperado numeric(14,2),
  efectivo_contado numeric(14,2),
  diferencia numeric(14,2),
  conteo_denominaciones jsonb,
  abierto_en timestamptz not null default now(),
  cerrado_en timestamptz
);
create unique index un_turno_abierto_por_usuario on turnos_caja (usuario_id) where estado = 'abierto';

-- ---------------------------------------------------------------------
-- Compras
-- ---------------------------------------------------------------------
create table compras (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  proveedor_id uuid references proveedores(id),
  bodega_id uuid not null references bodegas(id),
  numero_factura text,
  fecha date not null default (now() at time zone 'America/Bogota')::date,
  estado estado_documento not null default 'borrador',
  total numeric(14,2) not null default 0,
  documento_ia_id uuid,
  usuario_id uuid references auth.users(id),
  motivo_anulacion text,
  creado_en timestamptz not null default now()
);

create table compras_detalle (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  compra_id uuid not null references compras(id) on delete cascade,
  producto_id uuid not null references productos(id),
  presentacion_id uuid references presentaciones(id),
  cantidad numeric(14,3) not null check (cantidad > 0),       -- en la presentación indicada
  costo_unitario numeric(14,2) not null check (costo_unitario >= 0),
  subtotal numeric(14,2) generated always as (round(cantidad * costo_unitario, 2)) stored
);

-- Historial de precios por proveedor (comparador)
create table precios_proveedor (
  id bigint generated always as identity primary key,
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  proveedor_id uuid not null references proveedores(id),
  producto_id uuid not null references productos(id),
  costo_unitario_base numeric(14,2) not null,
  compra_id uuid references compras(id),
  fecha date not null
);
create index on precios_proveedor (organizacion_id, producto_id, fecha desc);

-- ---------------------------------------------------------------------
-- Ventas y pagos
-- ---------------------------------------------------------------------
create table ventas (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  bodega_id uuid not null references bodegas(id),
  cliente_id uuid references clientes(id),
  turno_id uuid references turnos_caja(id),
  numero bigint,
  estado estado_documento not null default 'borrador',
  subtotal numeric(14,2) not null default 0,
  descuento numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  costo_total numeric(14,2) not null default 0,
  origen text not null default 'pos',              -- pos, whatsapp, catalogo, ruta
  usuario_id uuid references auth.users(id),
  offline_id uuid,
  motivo_anulacion text,
  anulada_por uuid references auth.users(id),
  anulada_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (organizacion_id, offline_id),
  unique (organizacion_id, numero)
);
create index on ventas (organizacion_id, creado_en desc);

create table ventas_detalle (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  venta_id uuid not null references ventas(id) on delete cascade,
  producto_id uuid not null references productos(id),
  presentacion_id uuid references presentaciones(id),
  cantidad numeric(14,3) not null check (cantidad > 0),
  precio_unitario numeric(14,2) not null check (precio_unitario >= 0),
  descuento numeric(14,2) not null default 0,
  costo_unitario numeric(14,2),                    -- se llena al confirmar (utilidad exacta)
  subtotal numeric(14,2) generated always as (round(cantidad * precio_unitario - descuento, 2)) stored
);

create table comprobantes (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  imagen_url text not null,
  hash_imagen text,
  referencia text,
  entidad text,                                    -- nequi, daviplata, bancolombia...
  monto_leido numeric(14,2),
  fecha_leida timestamptz,
  nombre_leido text,
  confianza numeric(4,3),
  creado_en timestamptz not null default now()
);
create index on comprobantes (organizacion_id, hash_imagen);
create index on comprobantes (organizacion_id, referencia);

create table pagos_venta (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  venta_id uuid not null references ventas(id) on delete cascade,
  metodo metodo_pago not null,
  monto numeric(14,2) not null check (monto > 0),
  comprobante_id uuid references comprobantes(id),
  verificacion estado_verificacion not null default 'no_aplica',
  creado_en timestamptz not null default now()
);

create table abonos_cliente (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  cliente_id uuid not null references clientes(id),
  turno_id uuid references turnos_caja(id),
  metodo metodo_pago not null,
  monto numeric(14,2) not null check (monto > 0),
  comprobante_id uuid references comprobantes(id),
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Auditoría, IA, alertas y outbox
-- ---------------------------------------------------------------------
create table auditoria (
  id bigint generated always as identity primary key,
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  tabla text not null,
  registro_id text not null,
  accion text not null,                            -- crear, editar, anular, descuento, ajuste...
  antes jsonb,
  despues jsonb,
  usuario_id uuid,
  creado_en timestamptz not null default now()
);
create index on auditoria (organizacion_id, creado_en desc);

create table documentos_ia (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  tipo text not null,                              -- factura, comprobante, cuaderno, excel
  archivo_url text,
  resultado jsonb,
  confianza numeric(4,3),
  estado text not null default 'pendiente_revision',
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

create table alertas (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  tipo text not null,
  severidad text not null default 'media',         -- baja, media, alta
  mensaje text not null,
  datos jsonb,
  leida boolean not null default false,
  creado_en timestamptz not null default now()
);

create table eventos_outbox (
  id bigint generated always as identity primary key,
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  tipo text not null,
  payload jsonb not null default '{}',
  intentos int not null default 0,
  procesado_en timestamptz,
  creado_en timestamptz not null default now()
);
create index on eventos_outbox (procesado_en) where procesado_en is null;

create trigger trg_alerta_stock_bajo
after update of cantidad on existencias
for each row execute function alerta_stock_bajo();

-- Consecutivo de ventas por organización
create table consecutivos (
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  documento text not null,
  ultimo bigint not null default 0,
  primary key (organizacion_id, documento)
);

create or replace function siguiente_consecutivo(org uuid, doc text) returns bigint
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  insert into consecutivos (organizacion_id, documento, ultimo) values (org, doc, 1)
  on conflict (organizacion_id, documento) do update set ultimo = consecutivos.ultimo + 1
  returning ultimo into n;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Funciones de negocio (transaccionales)
-- ---------------------------------------------------------------------

-- Confirma una compra: entradas al inventario, historial de precios
create or replace function confirmar_compra(p_compra_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c compras%rowtype; d record; factor numeric(14,3);
begin
  perform set_config('surtix.desde_funcion', 'si', true);
  select * into c from compras where id = p_compra_id for update;
  if not found then raise exception 'Compra no existe'; end if;
  if not tiene_rol(c.organizacion_id, array['dueno','admin','bodeguero']::rol_miembro[]) then
    raise exception 'Sin permiso para confirmar compras';
  end if;
  if c.estado <> 'borrador' then raise exception 'La compra ya fue confirmada o anulada'; end if;

  for d in select * from compras_detalle where compra_id = c.id loop
    select coalesce((select p.factor from presentaciones p where p.id = d.presentacion_id), 1) into factor;
    insert into movimientos_inventario (organizacion_id, producto_id, bodega_id, tipo, cantidad,
      costo_unitario, documento_tipo, documento_id, usuario_id)
    values (c.organizacion_id, d.producto_id, c.bodega_id, 'compra', d.cantidad * factor,
      round(d.costo_unitario / factor, 2), 'compra', c.id, auth.uid());

    if c.proveedor_id is not null then
      insert into precios_proveedor (organizacion_id, proveedor_id, producto_id, costo_unitario_base, compra_id, fecha)
      values (c.organizacion_id, c.proveedor_id, d.producto_id, round(d.costo_unitario / factor, 2), c.id, c.fecha);
    end if;
  end loop;

  update compras set estado = 'confirmado',
         total = (select coalesce(sum(subtotal),0) from compras_detalle where compra_id = c.id)
   where id = c.id;

  insert into auditoria (organizacion_id, tabla, registro_id, accion, usuario_id)
  values (c.organizacion_id, 'compras', c.id::text, 'confirmar', auth.uid());
  perform set_config('surtix.desde_funcion', 'no', true);
end $$;

-- Confirma una venta: salidas al inventario, costo, cartera, numeración.
-- Idempotente: si la venta ya está confirmada, no hace nada.
create or replace function confirmar_venta(p_venta_id uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v ventas%rowtype; d record; factor numeric(14,3); costo numeric(14,2);
        total_pagos numeric(14,2); credito numeric(14,2); cli clientes%rowtype; costo_tot numeric(14,2) := 0;
begin
  perform set_config('surtix.desde_funcion', 'si', true);
  select * into v from ventas where id = p_venta_id for update;
  if not found then raise exception 'Venta no existe'; end if;
  if not tiene_rol(v.organizacion_id, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then
    raise exception 'Sin permiso para vender';
  end if;
  if v.estado = 'confirmado' then return v.numero; end if;
  if v.estado = 'anulado' then raise exception 'La venta está anulada'; end if;

  for d in select vd.*, p.maneja_inventario from ventas_detalle vd
           join productos p on p.id = vd.producto_id where vd.venta_id = v.id loop
    select coalesce((select pr.factor from presentaciones pr where pr.id = d.presentacion_id), 1) into factor;
    if d.maneja_inventario then
      insert into movimientos_inventario (organizacion_id, producto_id, bodega_id, tipo, cantidad,
        documento_tipo, documento_id, usuario_id, offline_id)
      values (v.organizacion_id, d.producto_id, v.bodega_id, 'venta', d.cantidad * factor,
        'venta', v.id, auth.uid(), v.offline_id)
      returning costo_unitario into costo;
    else
      costo := 0;
    end if;
    update ventas_detalle set costo_unitario = round(costo * factor, 2) where id = d.id;
    costo_tot := costo_tot + round(costo * factor * d.cantidad, 2);
  end loop;

  update ventas set
    subtotal = (select coalesce(sum(round(cantidad * precio_unitario, 2)),0) from ventas_detalle where venta_id = v.id),
    total = (select coalesce(sum(subtotal),0) from ventas_detalle where venta_id = v.id) - v.descuento,
    costo_total = costo_tot,
    numero = siguiente_consecutivo(v.organizacion_id, 'venta'),
    estado = 'confirmado'
  where id = v.id
  returning * into v;

  select coalesce(sum(monto),0) into total_pagos from pagos_venta where venta_id = v.id;
  if total_pagos <> v.total then
    raise exception 'Los pagos (%) no suman el total de la venta (%)', total_pagos, v.total;
  end if;

  select coalesce(sum(monto),0) into credito from pagos_venta where venta_id = v.id and metodo = 'credito';
  if credito > 0 then
    if v.cliente_id is null then raise exception 'Una venta a crédito necesita cliente'; end if;
    select * into cli from clientes where id = v.cliente_id for update;
    if cli.saldo + credito > cli.cupo_credito then
      insert into alertas (organizacion_id, tipo, severidad, mensaje, datos)
      values (v.organizacion_id, 'cupo_excedido', 'media',
              'Venta a crédito por encima del cupo de ' || cli.nombre,
              jsonb_build_object('venta_id', v.id, 'cliente_id', cli.id));
    end if;
    update clientes set saldo = saldo + credito where id = cli.id;
  end if;

  perform set_config('surtix.desde_funcion', 'no', true);
  return v.numero;
end $$;

-- Anula una venta confirmada: devuelve inventario y cartera, deja auditoría y evento.
create or replace function anular_venta(p_venta_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v ventas%rowtype; m record; credito numeric(14,2);
begin
  perform set_config('surtix.desde_funcion', 'si', true);
  if coalesce(trim(p_motivo),'') = '' then raise exception 'El motivo es obligatorio'; end if;
  select * into v from ventas where id = p_venta_id for update;
  if not found then raise exception 'Venta no existe'; end if;
  if not tiene_rol(v.organizacion_id, array['dueno','admin']::rol_miembro[]) then
    raise exception 'Solo dueño o admin pueden anular ventas';
  end if;
  if v.estado <> 'confirmado' then raise exception 'Solo se anulan ventas confirmadas'; end if;

  for m in select * from movimientos_inventario
           where documento_tipo = 'venta' and documento_id = v.id and tipo = 'venta' loop
    insert into movimientos_inventario (organizacion_id, producto_id, bodega_id, tipo, cantidad,
      costo_unitario, documento_tipo, documento_id, motivo, usuario_id)
    values (m.organizacion_id, m.producto_id, m.bodega_id, 'anulacion_entrada', m.cantidad,
      m.costo_unitario, 'venta', v.id, p_motivo, auth.uid());
  end loop;

  select coalesce(sum(monto),0) into credito from pagos_venta where venta_id = v.id and metodo = 'credito';
  if credito > 0 then
    update clientes set saldo = saldo - credito where id = v.cliente_id;
  end if;

  update ventas set estado = 'anulado', motivo_anulacion = p_motivo,
         anulada_por = auth.uid(), anulada_en = now()
   where id = v.id;

  insert into auditoria (organizacion_id, tabla, registro_id, accion, antes, despues, usuario_id)
  values (v.organizacion_id, 'ventas', v.id::text, 'anular',
          jsonb_build_object('estado','confirmado','total',v.total),
          jsonb_build_object('estado','anulado','motivo',p_motivo), auth.uid());

  insert into eventos_outbox (organizacion_id, tipo, payload)
  values (v.organizacion_id, 'venta.anulada',
          jsonb_build_object('venta_id', v.id, 'numero', v.numero, 'total', v.total,
                             'motivo', p_motivo, 'minutos_desde_venta',
                             round(extract(epoch from now() - v.creado_en) / 60)));
  perform set_config('surtix.desde_funcion', 'no', true);
end $$;

-- Ajuste de inventario con motivo; alerta si es grande
create or replace function ajustar_inventario(p_org uuid, p_producto uuid, p_bodega uuid,
  p_cantidad numeric, p_motivo text, p_costo numeric default 0) returns void
language plpgsql security definer set search_path = public as $$
declare valor numeric(14,2); umbral numeric(14,2); costo_prom numeric(14,2);
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero']::rol_miembro[]) then
    raise exception 'Sin permiso para ajustar inventario';
  end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'El motivo es obligatorio'; end if;
  if p_cantidad = 0 then return; end if;

  insert into movimientos_inventario (organizacion_id, producto_id, bodega_id, tipo, cantidad,
    costo_unitario, documento_tipo, motivo, usuario_id)
  values (p_org, p_producto, p_bodega,
          case when p_cantidad > 0 then 'ajuste_entrada' else 'ajuste_salida' end::tipo_movimiento,
          abs(p_cantidad), coalesce(p_costo,0), 'ajuste', p_motivo, auth.uid());

  if p_cantidad < 0 then
    select costo_promedio into costo_prom from existencias where producto_id = p_producto and bodega_id = p_bodega;
    valor := abs(p_cantidad) * coalesce(costo_prom,0);
    select umbral_ajuste_alerta into umbral from organizaciones where id = p_org;
    if valor >= umbral then
      insert into eventos_outbox (organizacion_id, tipo, payload)
      values (p_org, 'ajuste.grande', jsonb_build_object('producto_id', p_producto,
              'cantidad', p_cantidad, 'valor', valor, 'motivo', p_motivo, 'usuario_id', auth.uid()));
    end if;
  end if;

  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (p_org, 'existencias', p_producto::text, 'ajuste',
          jsonb_build_object('cantidad', p_cantidad, 'motivo', p_motivo), auth.uid());
end $$;

-- Verifica un comprobante contra duplicados y monto esperado
create or replace function verificar_comprobante(p_comprobante uuid, p_monto_esperado numeric)
returns estado_verificacion
language plpgsql security definer set search_path = public as $$
declare c comprobantes%rowtype; repetido boolean;
begin
  select * into c from comprobantes where id = p_comprobante;
  if not found then raise exception 'Comprobante no existe'; end if;
  if not (c.organizacion_id in (select mis_organizaciones())) then raise exception 'Sin acceso'; end if;

  select exists(
    select 1 from comprobantes o
    where o.organizacion_id = c.organizacion_id and o.id <> c.id
      and ((c.hash_imagen is not null and o.hash_imagen = c.hash_imagen)
        or (c.referencia is not null and o.referencia = c.referencia))
  ) into repetido;

  if repetido then
    insert into eventos_outbox (organizacion_id, tipo, payload)
    values (c.organizacion_id, 'comprobante.sospechoso',
            jsonb_build_object('comprobante_id', c.id, 'razon', 'repetido'));
    return 'sospechoso';
  end if;

  if c.monto_leido is null or c.monto_leido <> p_monto_esperado then
    insert into eventos_outbox (organizacion_id, tipo, payload)
    values (c.organizacion_id, 'comprobante.sospechoso',
            jsonb_build_object('comprobante_id', c.id, 'razon', 'monto_diferente',
                               'leido', c.monto_leido, 'esperado', p_monto_esperado));
    return 'sospechoso';
  end if;

  return 'verificado_ia';
end $$;

-- Cierra turno de caja calculando efectivo esperado
create or replace function cerrar_turno(p_turno uuid, p_contado numeric, p_denominaciones jsonb)
returns numeric
language plpgsql security definer set search_path = public as $$
declare t turnos_caja%rowtype; esperado numeric(14,2);
begin
  select * into t from turnos_caja where id = p_turno for update;
  if not found or t.estado <> 'abierto' then raise exception 'Turno no está abierto'; end if;
  if t.usuario_id <> auth.uid() and not tiene_rol(t.organizacion_id, array['dueno','admin']::rol_miembro[]) then
    raise exception 'Sin permiso para cerrar este turno';
  end if;

  select t.base_inicial
       + coalesce((select sum(pv.monto) from pagos_venta pv join ventas v on v.id = pv.venta_id
                   where v.turno_id = t.id and v.estado = 'confirmado' and pv.metodo = 'efectivo'), 0)
       + coalesce((select sum(a.monto) from abonos_cliente a
                   where a.turno_id = t.id and a.metodo = 'efectivo'), 0)
    into esperado;

  update turnos_caja set estado = 'cerrado', efectivo_esperado = esperado, efectivo_contado = p_contado,
         diferencia = p_contado - esperado, conteo_denominaciones = p_denominaciones, cerrado_en = now()
   where id = t.id;

  insert into eventos_outbox (organizacion_id, tipo, payload)
  values (t.organizacion_id, 'caja.cerrada', jsonb_build_object('turno_id', t.id,
          'esperado', esperado, 'contado', p_contado, 'diferencia', p_contado - esperado));
  return p_contado - esperado;
end $$;

-- Registra abono de cliente
create or replace function registrar_abono(p_cliente uuid, p_monto numeric, p_metodo metodo_pago,
  p_turno uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare cli clientes%rowtype; nuevo uuid;
begin
  perform set_config('surtix.desde_funcion', 'si', true);
  select * into cli from clientes where id = p_cliente for update;
  if not found or not (cli.organizacion_id in (select mis_organizaciones())) then
    raise exception 'Cliente no existe';
  end if;
  if p_metodo = 'credito' then raise exception 'Un abono no puede ser a crédito'; end if;
  insert into abonos_cliente (organizacion_id, cliente_id, turno_id, metodo, monto, usuario_id)
  values (cli.organizacion_id, cli.id, p_turno, p_metodo, p_monto, auth.uid()) returning id into nuevo;
  update clientes set saldo = saldo - p_monto where id = cli.id;
  perform set_config('surtix.desde_funcion', 'no', true);
  return nuevo;
end $$;

-- Crear negocio nuevo (registro): organización + bodega + dueño
create or replace function crear_organizacion(p_nombre text, p_nicho text, p_nombre_dueno text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  insert into organizaciones (nombre, nicho) values (p_nombre, coalesce(p_nicho,'general')) returning id into org;
  insert into miembros (organizacion_id, usuario_id, rol, nombre) values (org, auth.uid(), 'dueno', p_nombre_dueno);
  insert into bodegas (organizacion_id, nombre, es_principal) values (org, 'Principal', true);
  return org;
end $$;

-- ---------------------------------------------------------------------
-- Vistas para reportes
-- ---------------------------------------------------------------------
create or replace view v_ventas_dia with (security_invoker = true) as
select organizacion_id,
       (creado_en at time zone 'America/Bogota')::date as dia,
       count(*) as numero_ventas,
       sum(total) as total,
       sum(total - costo_total) as utilidad
from ventas where estado = 'confirmado'
group by 1, 2;

create or replace view v_plata_dormida with (security_invoker = true) as
select e.organizacion_id, e.producto_id, p.nombre, e.bodega_id, e.cantidad,
       round(e.cantidad * e.costo_promedio, 2) as valor_atrapado,
       (select max(m.creado_en) from movimientos_inventario m
         where m.producto_id = e.producto_id and m.tipo = 'venta') as ultima_venta
from existencias e join productos p on p.id = e.producto_id
where e.cantidad > 0;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'bodegas','categorias','productos','presentaciones','existencias','movimientos_inventario',
    'proveedores','clientes','turnos_caja','compras','compras_detalle','precios_proveedor',
    'ventas','ventas_detalle','comprobantes','pagos_venta','abonos_cliente','auditoria',
    'documentos_ia','alertas','eventos_outbox','consecutivos'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (organizacion_id in (select mis_organizaciones()))',
                   t || '_leer', t);
  end loop;

  -- Tablas que la app escribe directamente (el resto solo por funciones security definer)
  foreach t in array array[
    'bodegas','categorias','productos','presentaciones','proveedores','clientes','turnos_caja',
    'compras','compras_detalle','ventas','ventas_detalle','comprobantes','pagos_venta',
    'documentos_ia','alertas'
  ] loop
    execute format('create policy %I on %I for insert with check (organizacion_id in (select mis_organizaciones()))',
                   t || '_crear', t);
    execute format('create policy %I on %I for update using (organizacion_id in (select mis_organizaciones()))',
                   t || '_editar', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Protecciones: solo las funciones de negocio pueden confirmar/anular
-- documentos, tocar documentos confirmados o cambiar saldos de clientes.
-- Las funciones activan la marca de sesión 'surtix.desde_funcion'.
-- ---------------------------------------------------------------------
create or replace function desde_funcion() returns boolean
language sql stable as $$ select current_setting('surtix.desde_funcion', true) = 'si' $$;

create or replace function proteger_documento() returns trigger
language plpgsql as $$
begin
  if desde_funcion() then return new; end if;
  if tg_op = 'INSERT' then
    if new.estado <> 'borrador' then raise exception 'Los documentos se crean en borrador'; end if;
    return new;
  end if;
  if new.estado is distinct from old.estado then
    raise exception 'El estado de un documento solo cambia con confirmar/anular';
  end if;
  if old.estado <> 'borrador' then
    raise exception 'Un documento confirmado no se edita: anúlalo y crea uno nuevo';
  end if;
  return new;
end $$;

create trigger trg_proteger_venta before insert or update on ventas
for each row execute function proteger_documento();
create trigger trg_proteger_compra before insert or update on compras
for each row execute function proteger_documento();

-- Detalles y pagos: solo se tocan mientras el documento padre está en borrador
create or replace function proteger_detalle() returns trigger
language plpgsql as $$
declare est estado_documento; fila record;
begin
  if desde_funcion() then return coalesce(new, old); end if;
  fila := coalesce(new, old);
  if tg_table_name = 'compras_detalle' then
    select estado into est from compras where id = fila.compra_id;
  else
    select estado into est from ventas where id = fila.venta_id;
  end if;
  if est <> 'borrador' then
    raise exception 'No se puede modificar el detalle de un documento confirmado o anulado';
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_proteger_ventas_detalle before insert or update or delete on ventas_detalle
for each row execute function proteger_detalle();
create trigger trg_proteger_pagos_venta before insert or update or delete on pagos_venta
for each row execute function proteger_detalle();
create trigger trg_proteger_compras_detalle before insert or update or delete on compras_detalle
for each row execute function proteger_detalle();

create or replace function proteger_saldo_cliente() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.saldo <> 0 and not desde_funcion() then
      raise exception 'El saldo inicial se registra con la migración de deudas, no a mano';
    end if;
  elsif new.saldo is distinct from old.saldo and not desde_funcion() then
    raise exception 'El saldo del cliente solo cambia con ventas a crédito y abonos';
  end if;
  return new;
end $$;

create trigger trg_proteger_saldo before insert or update on clientes
for each row execute function proteger_saldo_cliente();

-- Pagos: la verificación la pone el servidor, no el navegador
create or replace function proteger_verificacion() returns trigger
language plpgsql as $$
begin
  if not desde_funcion() and new.verificacion in ('verificado_ia','verificado_manual') then
    raise exception 'La verificación del pago la asigna el sistema';
  end if;
  return new;
end $$;

create trigger trg_proteger_verificacion before insert or update on pagos_venta
for each row execute function proteger_verificacion();

-- Marca un pago como verificado (se llama desde el servidor tras leer el comprobante, o por dueño/admin)
create or replace function marcar_verificacion_pago(p_pago uuid, p_estado estado_verificacion) returns void
language plpgsql security definer set search_path = public as $$
declare org uuid;
begin
  select organizacion_id into org from pagos_venta where id = p_pago;
  if org is null or not (org in (select mis_organizaciones())) then raise exception 'Pago no existe'; end if;
  if p_estado = 'verificado_manual' and not tiene_rol(org, array['dueno','admin']::rol_miembro[]) then
    raise exception 'Solo dueño o admin verifican pagos manualmente';
  end if;
  perform set_config('surtix.desde_funcion', 'si', true);
  update pagos_venta set verificacion = p_estado where id = p_pago;
end $$;

alter table organizaciones enable row level security;
create policy organizaciones_leer on organizaciones for select using (id in (select mis_organizaciones()));
create policy organizaciones_editar on organizaciones for update using (tiene_rol(id, array['dueno','admin']::rol_miembro[]));

alter table miembros enable row level security;
create policy miembros_leer on miembros for select using (organizacion_id in (select mis_organizaciones()));
create policy miembros_gestionar on miembros for all
  using (tiene_rol(organizacion_id, array['dueno','admin']::rol_miembro[]))
  with check (tiene_rol(organizacion_id, array['dueno','admin']::rol_miembro[]));
