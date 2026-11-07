-- 0014: órdenes de compra, cuentas por pagar y devoluciones a proveedor (Fase 2: 2.3)
--
--  * Una orden de compra (OC) es una intención: NO mueve inventario. Al recibir mercancía se crea una compra
--    confirmada (que sí mueve inventario con costo promedio) y se actualiza lo recibido de la OC.
--  * Compras a crédito generan una cuenta por pagar (CxP) con vencimiento. Los pagos al proveedor la reducen.
--  * Una devolución a proveedor saca mercancía (movimiento) y abona a la CxP de la compra si existe.

alter table compras
  add column if not exists orden_compra_id uuid,
  add column if not exists condicion_pago text not null default 'contado' check (condicion_pago in ('contado','credito'));

create table ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  proveedor_id uuid not null references proveedores(id),
  bodega_id uuid not null references bodegas(id),
  numero bigint,
  estado text not null default 'borrador' check (estado in ('borrador','enviada','recibida_parcial','recibida','cancelada')),
  fecha_esperada date,
  nota text,
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (organizacion_id, numero)
);

create table ordenes_compra_detalle (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  orden_id uuid not null references ordenes_compra(id) on delete cascade,
  producto_id uuid not null references productos(id),
  presentacion_id uuid references presentaciones(id),
  cantidad_pedida numeric(14,3) not null check (cantidad_pedida > 0),
  cantidad_recibida numeric(14,3) not null default 0 check (cantidad_recibida >= 0),
  costo_unitario numeric(14,2) not null check (costo_unitario >= 0)
);
create index on ordenes_compra_detalle (orden_id);

alter table compras add constraint compras_orden_fk foreign key (orden_compra_id) references ordenes_compra(id);

create table cuentas_por_pagar (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  proveedor_id uuid not null references proveedores(id),
  compra_id uuid not null unique references compras(id),
  monto numeric(14,2) not null check (monto > 0),
  saldo numeric(14,2) not null check (saldo >= 0),
  vence date not null,
  estado text not null default 'abierta' check (estado in ('abierta','pagada','anulada')),
  creado_en timestamptz not null default now()
);
create index on cuentas_por_pagar (organizacion_id, estado, vence);

create table pagos_proveedor (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  cxp_id uuid not null references cuentas_por_pagar(id),
  monto numeric(14,2) not null check (monto > 0),
  metodo metodo_pago not null check (metodo <> 'credito'),
  referencia text,
  tipo text not null default 'pago' check (tipo in ('pago','devolucion')),
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

create table devoluciones_proveedor (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  proveedor_id uuid not null references proveedores(id),
  bodega_id uuid not null references bodegas(id),
  compra_id uuid references compras(id),
  numero bigint,
  motivo text not null,
  total numeric(14,2) not null default 0,
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (organizacion_id, numero)
);

create table devoluciones_proveedor_detalle (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  devolucion_id uuid not null references devoluciones_proveedor(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad numeric(14,3) not null check (cantidad > 0),
  costo_unitario numeric(14,2) not null check (costo_unitario >= 0)
);

do $$
declare t text;
begin
  foreach t in array array['ordenes_compra','ordenes_compra_detalle','cuentas_por_pagar','pagos_proveedor',
                           'devoluciones_proveedor','devoluciones_proveedor_detalle'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (organizacion_id in (select mis_organizaciones()))', t || '_leer', t);
  end loop;
end $$;
-- Todo se escribe con las funciones de abajo.

create trigger trg_misma_org before insert or update on ordenes_compra
  for each row execute function exigir_misma_organizacion('proveedor_id:proveedores', 'bodega_id:bodegas');
create trigger trg_misma_org before insert or update on ordenes_compra_detalle
  for each row execute function exigir_misma_organizacion('orden_id:ordenes_compra', 'producto_id:productos', 'presentacion_id:presentaciones');
create trigger trg_misma_org before insert or update on cuentas_por_pagar
  for each row execute function exigir_misma_organizacion('proveedor_id:proveedores', 'compra_id:compras');
create trigger trg_misma_org before insert or update on pagos_proveedor
  for each row execute function exigir_misma_organizacion('cxp_id:cuentas_por_pagar');
create trigger trg_misma_org before insert or update on devoluciones_proveedor
  for each row execute function exigir_misma_organizacion('proveedor_id:proveedores', 'bodega_id:bodegas', 'compra_id:compras');
create trigger trg_misma_org before insert or update on devoluciones_proveedor_detalle
  for each row execute function exigir_misma_organizacion('devolucion_id:devoluciones_proveedor', 'producto_id:productos');

-- ---------------------------------------------------------------------
-- Órdenes de compra
-- ---------------------------------------------------------------------
create or replace function crear_orden_compra(p_org uuid, p_proveedor uuid, p_bodega uuid, p_lineas jsonb,
  p_fecha_esperada date default null, p_nota text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare oc uuid; l jsonb; n int := 0;
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero']::rol_miembro[]) then
    raise exception 'Sin permiso para crear órdenes de compra';
  end if;
  if not exists (select 1 from proveedores where id = p_proveedor and organizacion_id = p_org and activo) then
    raise exception 'Proveedor no existe o está inactivo';
  end if;
  if not exists (select 1 from bodegas where id = p_bodega and organizacion_id = p_org and activa) then
    raise exception 'Bodega no existe o está inactiva';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos un producto a la orden';
  end if;

  insert into ordenes_compra (organizacion_id, proveedor_id, bodega_id, numero, fecha_esperada, nota, usuario_id)
  values (p_org, p_proveedor, p_bodega, siguiente_consecutivo(p_org, 'orden_compra'), p_fecha_esperada,
          nullif(trim(p_nota), ''), auth.uid())
  returning id into oc;

  for l in select * from jsonb_array_elements(p_lineas) loop
    if coalesce((l->>'cantidad')::numeric, 0) <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
    insert into ordenes_compra_detalle (organizacion_id, orden_id, producto_id, presentacion_id, cantidad_pedida, costo_unitario)
    values (p_org, oc, (l->>'producto_id')::uuid, nullif(l->>'presentacion_id','')::uuid,
            (l->>'cantidad')::numeric, coalesce((l->>'costo')::numeric, 0));
    n := n + 1;
  end loop;
  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (p_org, 'ordenes_compra', oc::text, 'crear', jsonb_build_object('productos', n), auth.uid());
  return oc;
end $$;

create or replace function cambiar_estado_orden(p_orden uuid, p_estado text) returns void
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra%rowtype;
begin
  select * into o from ordenes_compra where id = p_orden for update;
  if not found then raise exception 'Orden no existe'; end if;
  if not tiene_rol(o.organizacion_id, array['dueno','admin','bodeguero']::rol_miembro[]) then
    raise exception 'Sin permiso';
  end if;
  if p_estado = 'enviada' and o.estado = 'borrador' then null;
  elsif p_estado = 'cancelada' and o.estado in ('borrador','enviada') then null;
  else raise exception 'No se puede pasar la orden de % a %', o.estado, p_estado;
  end if;
  update ordenes_compra set estado = p_estado where id = o.id;
end $$;

-- Recibe mercancía de una OC: crea la compra confirmada y, si es a crédito, la cuenta por pagar.
-- p_lineas: [{detalle_id, cantidad, costo (opcional: costo real de la factura)}]
create or replace function recibir_orden_compra(p_orden uuid, p_lineas jsonb, p_factura text default null,
  p_condicion text default 'contado', p_dias_credito int default 30) returns uuid
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra%rowtype; l jsonb; d ordenes_compra_detalle%rowtype; c uuid; cant numeric; costo numeric;
        pendiente boolean;
begin
  select * into o from ordenes_compra where id = p_orden for update;
  if not found then raise exception 'Orden no existe'; end if;
  if not tiene_rol(o.organizacion_id, array['dueno','admin','bodeguero']::rol_miembro[]) then
    raise exception 'Sin permiso para recibir mercancía';
  end if;
  if o.estado not in ('enviada','recibida_parcial','borrador') then raise exception 'La orden no admite recibos (%)', o.estado; end if;
  if p_condicion not in ('contado','credito') then raise exception 'Condición de pago inválida'; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Indica qué mercancía llegó';
  end if;

  insert into compras (organizacion_id, proveedor_id, bodega_id, numero_factura, usuario_id, orden_compra_id, condicion_pago)
  values (o.organizacion_id, o.proveedor_id, o.bodega_id, nullif(trim(p_factura),''), auth.uid(), o.id, p_condicion)
  returning id into c;

  for l in select * from jsonb_array_elements(p_lineas) loop
    cant := (l->>'cantidad')::numeric;
    if cant is null or cant <= 0 then continue; end if;
    select * into d from ordenes_compra_detalle where id = (l->>'detalle_id')::uuid and orden_id = o.id for update;
    if not found then raise exception 'Una línea no pertenece a esta orden'; end if;
    if d.cantidad_recibida + cant > d.cantidad_pedida * 1.1 then
      raise exception 'No puedes recibir más de lo pedido (tolerancia 10 %%)';
    end if;
    costo := coalesce((l->>'costo')::numeric, d.costo_unitario);
    insert into compras_detalle (organizacion_id, compra_id, producto_id, presentacion_id, cantidad, costo_unitario)
    values (o.organizacion_id, c, d.producto_id, d.presentacion_id, cant, costo);
    update ordenes_compra_detalle set cantidad_recibida = cantidad_recibida + cant where id = d.id;
  end loop;
  if not exists (select 1 from compras_detalle where compra_id = c) then
    raise exception 'Indica qué mercancía llegó';
  end if;

  perform confirmar_compra(c);
  if p_condicion = 'credito' then perform registrar_cuenta_por_pagar(c, p_dias_credito); end if;

  select exists (select 1 from ordenes_compra_detalle where orden_id = o.id and cantidad_recibida < cantidad_pedida) into pendiente;
  update ordenes_compra set estado = case when pendiente then 'recibida_parcial' else 'recibida' end where id = o.id;
  return c;
end $$;

-- ---------------------------------------------------------------------
-- Cuentas por pagar
-- ---------------------------------------------------------------------
create or replace function registrar_cuenta_por_pagar(p_compra uuid, p_dias int default 30) returns uuid
language plpgsql security definer set search_path = public as $$
declare c compras%rowtype; nuevo uuid;
begin
  select * into c from compras where id = p_compra for update;
  if not found or c.organizacion_id not in (select mis_organizaciones()) then raise exception 'Compra no existe'; end if;
  if not tiene_rol(c.organizacion_id, array['dueno','admin','bodeguero']::rol_miembro[]) then raise exception 'Sin permiso'; end if;
  if c.estado <> 'confirmado' then raise exception 'La compra debe estar confirmada'; end if;
  if c.proveedor_id is null then raise exception 'Una compra a crédito necesita proveedor'; end if;
  if p_dias is null or p_dias < 0 or p_dias > 365 then raise exception 'Los días de crédito deben estar entre 0 y 365'; end if;
  if c.total <= 0 then raise exception 'La compra no tiene valor'; end if;
  insert into cuentas_por_pagar (organizacion_id, proveedor_id, compra_id, monto, saldo, vence)
  values (c.organizacion_id, c.proveedor_id, c.id, c.total, c.total, c.fecha + p_dias)
  returning id into nuevo;
  perform set_config('surtix.desde_funcion', 'si', true);
  update compras set condicion_pago = 'credito' where id = c.id;
  perform set_config('surtix.desde_funcion', 'no', true);
  return nuevo;
end $$;

create or replace function registrar_pago_proveedor(p_cxp uuid, p_monto numeric, p_metodo metodo_pago, p_referencia text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare x cuentas_por_pagar%rowtype; nuevo uuid;
begin
  select * into x from cuentas_por_pagar where id = p_cxp for update;
  if not found or x.organizacion_id not in (select mis_organizaciones()) then raise exception 'La cuenta no existe'; end if;
  if not tiene_rol(x.organizacion_id, array['dueno','admin']::rol_miembro[]) then
    raise exception 'Solo dueño o admin registran pagos a proveedores';
  end if;
  if x.estado <> 'abierta' then raise exception 'La cuenta no está abierta'; end if;
  if p_metodo = 'credito' then raise exception 'Un pago no puede ser a crédito'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El pago debe ser mayor a cero'; end if;
  if p_monto > x.saldo then raise exception 'El pago (%) supera lo que se debe (%)', p_monto, x.saldo; end if;

  insert into pagos_proveedor (organizacion_id, cxp_id, monto, metodo, referencia, usuario_id)
  values (x.organizacion_id, x.id, p_monto, p_metodo, nullif(trim(p_referencia),''), auth.uid())
  returning id into nuevo;
  update cuentas_por_pagar set saldo = saldo - p_monto,
         estado = case when saldo - p_monto = 0 then 'pagada' else 'abierta' end
   where id = x.id;
  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (x.organizacion_id, 'cuentas_por_pagar', x.id::text, 'pago', jsonb_build_object('monto', p_monto, 'metodo', p_metodo), auth.uid());
  return nuevo;
end $$;

-- Anular una compra no puede dejar pagos huérfanos: se cierra la cuenta si no hubo pagos.
create or replace function cerrar_cxp_al_anular_compra() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'anulado' and old.estado <> 'anulado' then
    if exists (select 1 from pagos_proveedor p join cuentas_por_pagar x on x.id = p.cxp_id where x.compra_id = new.id) then
      raise exception 'La compra tiene pagos al proveedor registrados: no se puede anular';
    end if;
    update cuentas_por_pagar set estado = 'anulada', saldo = 0 where compra_id = new.id;
  end if;
  return new;
end $$;
create trigger trg_cerrar_cxp after update of estado on compras
  for each row execute function cerrar_cxp_al_anular_compra();

-- ---------------------------------------------------------------------
-- Devoluciones a proveedor
-- ---------------------------------------------------------------------
create or replace function registrar_devolucion_proveedor(p_org uuid, p_proveedor uuid, p_bodega uuid, p_lineas jsonb,
  p_motivo text, p_compra uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare dev uuid; l jsonb; prod uuid; cant numeric; costo numeric; tot numeric := 0; x cuentas_por_pagar%rowtype; abono numeric;
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero']::rol_miembro[]) then
    raise exception 'Sin permiso para devolver mercancía a proveedores';
  end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'El motivo es obligatorio'; end if;
  if not exists (select 1 from proveedores where id = p_proveedor and organizacion_id = p_org) then raise exception 'Proveedor no existe'; end if;
  if not exists (select 1 from bodegas where id = p_bodega and organizacion_id = p_org) then raise exception 'Bodega no existe'; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then raise exception 'Agrega al menos un producto'; end if;

  insert into devoluciones_proveedor (organizacion_id, proveedor_id, bodega_id, compra_id, numero, motivo, usuario_id)
  values (p_org, p_proveedor, p_bodega, p_compra, siguiente_consecutivo(p_org, 'devolucion_proveedor'), trim(p_motivo), auth.uid())
  returning id into dev;

  for l in select * from jsonb_array_elements(p_lineas) loop
    prod := (l->>'producto_id')::uuid;
    cant := (l->>'cantidad')::numeric;
    if cant is null or cant <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
    if coalesce((select e.cantidad from existencias e where e.producto_id = prod and e.bodega_id = p_bodega), 0) < cant then
      raise exception 'No hay suficiente stock de "%" para devolver', (select nombre from productos where id = prod);
    end if;
    costo := coalesce((l->>'costo')::numeric,
                      (select e.costo_promedio from existencias e where e.producto_id = prod and e.bodega_id = p_bodega), 0);
    insert into movimientos_inventario (organizacion_id, producto_id, bodega_id, tipo, cantidad, documento_tipo, documento_id, motivo, usuario_id)
    values (p_org, prod, p_bodega, 'devolucion_proveedor', cant, 'devolucion_proveedor', dev, p_motivo, auth.uid());
    insert into devoluciones_proveedor_detalle (organizacion_id, devolucion_id, producto_id, cantidad, costo_unitario)
    values (p_org, dev, prod, cant, costo);
    tot := tot + round(cant * costo, 2);
  end loop;
  update devoluciones_proveedor set total = tot where id = dev;

  -- Si la compra se debe, la devolución abona a esa deuda (nota crédito).
  if p_compra is not null then
    select * into x from cuentas_por_pagar where compra_id = p_compra and organizacion_id = p_org and estado = 'abierta' for update;
    if found then
      abono := least(tot, x.saldo);
      if abono > 0 then
        insert into pagos_proveedor (organizacion_id, cxp_id, monto, metodo, referencia, tipo, usuario_id)
        values (p_org, x.id, abono, 'otro', 'Devolución #' || dev::text, 'devolucion', auth.uid());
        update cuentas_por_pagar set saldo = saldo - abono, estado = case when saldo - abono = 0 then 'pagada' else 'abierta' end where id = x.id;
      end if;
    end if;
  end if;
  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (p_org, 'devoluciones_proveedor', dev::text, 'crear', jsonb_build_object('total', tot, 'motivo', p_motivo), auth.uid());
  return dev;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'crear_orden_compra(uuid,uuid,uuid,jsonb,date,text)',
    'cambiar_estado_orden(uuid,text)',
    'recibir_orden_compra(uuid,jsonb,text,text,int)',
    'registrar_cuenta_por_pagar(uuid,int)',
    'registrar_pago_proveedor(uuid,numeric,metodo_pago,text)',
    'registrar_devolucion_proveedor(uuid,uuid,uuid,jsonb,text,uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
