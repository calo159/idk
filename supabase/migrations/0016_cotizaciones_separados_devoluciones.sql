-- 0016: cotizaciones, separados con abonos y devoluciones de clientes (Fase 2: 2.6)
--
--  * Cotización: documento sin efecto en inventario ni caja. Se convierte en venta desde el POS.
--  * Separado (apartado): el cliente reserva mercancía y la va pagando. La mercancía queda "reservada"
--    (no se descuenta del inventario hasta la entrega). Los abonos en efectivo entran a la caja del turno
--    donde se recibieron. Al entregar se crea la venta; la parte ya abonada se registra como pago "otro".
--  * Devolución de cliente: devuelve la mercancía al inventario (al costo de la venta original) y reembolsa
--    en efectivo (sale de la caja), por otro medio o como abono a su deuda. Los reportes de ventas la restan.

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table cotizaciones (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  cliente_id uuid references clientes(id),
  numero bigint,
  estado text not null default 'vigente' check (estado in ('vigente','aceptada','cancelada')),
  vigencia_hasta date not null,
  nota text,
  venta_id uuid references ventas(id),
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (organizacion_id, numero)
);
create table cotizaciones_detalle (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  cotizacion_id uuid not null references cotizaciones(id) on delete cascade,
  producto_id uuid not null references productos(id),
  presentacion_id uuid references presentaciones(id),
  cantidad numeric(14,3) not null check (cantidad > 0),
  precio_unitario numeric(14,2) not null check (precio_unitario >= 0),
  descuento numeric(14,2) not null default 0 check (descuento >= 0)
);

create table separados (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  cliente_id uuid not null references clientes(id),
  bodega_id uuid not null references bodegas(id),
  numero bigint,
  estado text not null default 'activo' check (estado in ('activo','entregado','cancelado')),
  total numeric(14,2) not null default 0,
  abonado numeric(14,2) not null default 0 check (abonado >= 0),
  fecha_limite date,
  nota text,
  venta_id uuid references ventas(id),
  motivo_cancelacion text,
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (organizacion_id, numero)
);
create table separados_detalle (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  separado_id uuid not null references separados(id) on delete cascade,
  producto_id uuid not null references productos(id),
  presentacion_id uuid references presentaciones(id),
  cantidad numeric(14,3) not null check (cantidad > 0),
  precio_unitario numeric(14,2) not null check (precio_unitario >= 0)
);
create table abonos_separado (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  separado_id uuid not null references separados(id),
  turno_id uuid references turnos_caja(id),
  metodo metodo_pago not null check (metodo <> 'credito'),
  monto numeric(14,2) not null check (monto > 0),
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now()
);

create table devoluciones_cliente (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  venta_id uuid not null references ventas(id),
  turno_id uuid references turnos_caja(id),
  numero bigint,
  motivo text not null,
  total numeric(14,2) not null default 0,
  costo_total numeric(14,2) not null default 0,
  reembolso text not null check (reembolso in ('efectivo','nequi','daviplata','transferencia','tarjeta','otro','abono_deuda')),
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  unique (organizacion_id, numero)
);
create table devoluciones_cliente_detalle (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  devolucion_id uuid not null references devoluciones_cliente(id) on delete cascade,
  venta_detalle_id uuid not null references ventas_detalle(id),
  producto_id uuid not null references productos(id),
  cantidad numeric(14,3) not null check (cantidad > 0),
  valor numeric(14,2) not null
);

do $$
declare t text;
begin
  foreach t in array array['cotizaciones','cotizaciones_detalle','separados','separados_detalle','abonos_separado',
                           'devoluciones_cliente','devoluciones_cliente_detalle'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (organizacion_id in (select mis_organizaciones()))', t || '_leer', t);
  end loop;
end $$;

create trigger trg_misma_org before insert or update on cotizaciones
  for each row execute function exigir_misma_organizacion('cliente_id:clientes', 'venta_id:ventas');
create trigger trg_misma_org before insert or update on cotizaciones_detalle
  for each row execute function exigir_misma_organizacion('cotizacion_id:cotizaciones', 'producto_id:productos', 'presentacion_id:presentaciones');
create trigger trg_misma_org before insert or update on separados
  for each row execute function exigir_misma_organizacion('cliente_id:clientes', 'bodega_id:bodegas', 'venta_id:ventas');
create trigger trg_misma_org before insert or update on separados_detalle
  for each row execute function exigir_misma_organizacion('separado_id:separados', 'producto_id:productos', 'presentacion_id:presentaciones');
create trigger trg_misma_org before insert or update on abonos_separado
  for each row execute function exigir_misma_organizacion('separado_id:separados', 'turno_id:turnos_caja');
create trigger trg_misma_org before insert or update on devoluciones_cliente
  for each row execute function exigir_misma_organizacion('venta_id:ventas', 'turno_id:turnos_caja');
create trigger trg_misma_org before insert or update on devoluciones_cliente_detalle
  for each row execute function exigir_misma_organizacion('devolucion_id:devoluciones_cliente', 'venta_detalle_id:ventas_detalle', 'producto_id:productos');

-- ---------------------------------------------------------------------
-- Cotizaciones
-- ---------------------------------------------------------------------
create or replace function crear_cotizacion(p_org uuid, p_cliente uuid, p_lineas jsonb, p_vigencia date default null, p_nota text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid; l jsonb;
begin
  if not tiene_rol(p_org, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then raise exception 'Sin permiso para cotizar'; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then raise exception 'Agrega al menos un producto'; end if;
  if p_cliente is not null and not exists (select 1 from clientes where id = p_cliente and organizacion_id = p_org) then
    raise exception 'Cliente no existe';
  end if;
  insert into cotizaciones (organizacion_id, cliente_id, numero, vigencia_hasta, nota, usuario_id)
  values (p_org, p_cliente, siguiente_consecutivo(p_org, 'cotizacion'),
          coalesce(p_vigencia, (now() at time zone 'America/Bogota')::date + 15), nullif(trim(p_nota), ''), auth.uid())
  returning id into c;
  for l in select * from jsonb_array_elements(p_lineas) loop
    if coalesce((l->>'cantidad')::numeric, 0) <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
    insert into cotizaciones_detalle (organizacion_id, cotizacion_id, producto_id, presentacion_id, cantidad, precio_unitario, descuento)
    values (p_org, c, (l->>'producto_id')::uuid, nullif(l->>'presentacion_id','')::uuid, (l->>'cantidad')::numeric,
            (l->>'precio')::numeric, coalesce((l->>'descuento')::numeric, 0));
  end loop;
  return c;
end $$;

create or replace function cambiar_estado_cotizacion(p_cot uuid, p_estado text, p_venta uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare c cotizaciones%rowtype;
begin
  select * into c from cotizaciones where id = p_cot for update;
  if not found or c.organizacion_id not in (select mis_organizaciones()) then raise exception 'Cotización no existe'; end if;
  if not tiene_rol(c.organizacion_id, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then raise exception 'Sin permiso'; end if;
  if c.estado <> 'vigente' then raise exception 'La cotización ya está %', c.estado; end if;
  if p_estado not in ('aceptada','cancelada') then raise exception 'Estado inválido'; end if;
  update cotizaciones set estado = p_estado, venta_id = p_venta where id = c.id;
end $$;

-- ---------------------------------------------------------------------
-- Separados
-- ---------------------------------------------------------------------
create or replace function crear_separado(p_org uuid, p_cliente uuid, p_bodega uuid, p_lineas jsonb,
  p_fecha_limite date default null, p_nota text default null, p_abono numeric default 0,
  p_metodo metodo_pago default 'efectivo', p_turno uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare s uuid; l jsonb; tot numeric := 0; sub numeric;
begin
  if not tiene_rol(p_org, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then raise exception 'Sin permiso para crear separados'; end if;
  if not exists (select 1 from clientes where id = p_cliente and organizacion_id = p_org) then raise exception 'Un separado necesita cliente'; end if;
  if not exists (select 1 from bodegas where id = p_bodega and organizacion_id = p_org) then raise exception 'Bodega no existe'; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then raise exception 'Agrega al menos un producto'; end if;

  insert into separados (organizacion_id, cliente_id, bodega_id, numero, fecha_limite, nota, usuario_id)
  values (p_org, p_cliente, p_bodega, siguiente_consecutivo(p_org, 'separado'), p_fecha_limite, nullif(trim(p_nota), ''), auth.uid())
  returning id into s;
  for l in select * from jsonb_array_elements(p_lineas) loop
    if coalesce((l->>'cantidad')::numeric, 0) <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
    insert into separados_detalle (organizacion_id, separado_id, producto_id, presentacion_id, cantidad, precio_unitario)
    values (p_org, s, (l->>'producto_id')::uuid, nullif(l->>'presentacion_id','')::uuid, (l->>'cantidad')::numeric, (l->>'precio')::numeric);
    sub := round((l->>'cantidad')::numeric * (l->>'precio')::numeric, 2);
    tot := tot + sub;
  end loop;
  if tot <= 0 then raise exception 'El separado no tiene valor'; end if;
  update separados set total = tot where id = s;
  if coalesce(p_abono, 0) > 0 then perform abonar_separado(s, p_abono, p_metodo, p_turno); end if;
  return s;
end $$;

create or replace function abonar_separado(p_separado uuid, p_monto numeric, p_metodo metodo_pago, p_turno uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare s separados%rowtype; nuevo uuid; t turnos_caja%rowtype;
begin
  select * into s from separados where id = p_separado for update;
  if not found or s.organizacion_id not in (select mis_organizaciones()) then raise exception 'Separado no existe'; end if;
  if not tiene_rol(s.organizacion_id, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then raise exception 'Sin permiso para recibir abonos'; end if;
  if s.estado <> 'activo' then raise exception 'El separado no está activo'; end if;
  if p_metodo = 'credito' then raise exception 'Un abono no puede ser a crédito'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El abono debe ser mayor a cero'; end if;
  if p_monto > s.total - s.abonado then raise exception 'El abono (%) supera lo que falta (%)', p_monto, s.total - s.abonado; end if;
  if p_metodo = 'efectivo' then
    select * into t from turnos_caja where id = p_turno and organizacion_id = s.organizacion_id;
    if not found or t.estado <> 'abierto' then raise exception 'Un abono en efectivo necesita un turno de caja abierto'; end if;
    if t.usuario_id <> auth.uid() and not tiene_rol(s.organizacion_id, array['dueno','admin']::rol_miembro[]) then
      raise exception 'Ese turno es de otra persona';
    end if;
  end if;
  insert into abonos_separado (organizacion_id, separado_id, turno_id, metodo, monto, usuario_id)
  values (s.organizacion_id, s.id, case when p_metodo = 'efectivo' then p_turno end, p_metodo, p_monto, auth.uid())
  returning id into nuevo;
  update separados set abonado = abonado + p_monto where id = s.id;
  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (s.organizacion_id, 'separados', s.id::text, 'abono', jsonb_build_object('monto', p_monto, 'metodo', p_metodo), auth.uid());
  return nuevo;
end $$;

-- Entrega: crea la venta. Lo ya abonado entra como pago "otro"; el saldo se paga ahora con p_pagos.
create or replace function entregar_separado(p_separado uuid, p_pagos jsonb, p_turno uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare s separados%rowtype; t turnos_caja%rowtype; v uuid; d record; p jsonb; faltante numeric; suma numeric := 0;
begin
  select * into s from separados where id = p_separado for update;
  if not found or s.organizacion_id not in (select mis_organizaciones()) then raise exception 'Separado no existe'; end if;
  if not tiene_rol(s.organizacion_id, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then raise exception 'Sin permiso para entregar'; end if;
  if s.estado <> 'activo' then raise exception 'El separado no está activo'; end if;
  select * into t from turnos_caja where id = p_turno and organizacion_id = s.organizacion_id;
  if not found or t.estado <> 'abierto' or t.usuario_id <> auth.uid() then raise exception 'Necesitas tu turno de caja abierto para entregar'; end if;
  faltante := s.total - s.abonado;

  for p in select * from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) loop
    if (p->>'metodo') = 'credito' then raise exception 'La entrega de un separado no se puede fiar'; end if;
    suma := suma + (p->>'monto')::numeric;
  end loop;
  if suma <> faltante then raise exception 'Los pagos (%) deben sumar lo que falta (%)', suma, faltante; end if;

  insert into ventas (organizacion_id, bodega_id, cliente_id, turno_id, usuario_id, origen)
  values (s.organizacion_id, t.bodega_id, s.cliente_id, t.id, auth.uid(), 'separado') returning id into v;
  for d in select * from separados_detalle where separado_id = s.id loop
    insert into ventas_detalle (organizacion_id, venta_id, producto_id, presentacion_id, cantidad, precio_unitario)
    values (s.organizacion_id, v, d.producto_id, d.presentacion_id, d.cantidad, d.precio_unitario);
  end loop;
  if s.abonado > 0 then
    insert into pagos_venta (organizacion_id, venta_id, metodo, monto) values (s.organizacion_id, v, 'otro', s.abonado);
  end if;
  for p in select * from jsonb_array_elements(coalesce(p_pagos, '[]'::jsonb)) loop
    if (p->>'monto')::numeric > 0 then
      insert into pagos_venta (organizacion_id, venta_id, metodo, monto)
      values (s.organizacion_id, v, (p->>'metodo')::metodo_pago, (p->>'monto')::numeric);
    end if;
  end loop;
  perform confirmar_venta(v);
  update separados set estado = 'entregado', venta_id = v where id = s.id;
  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (s.organizacion_id, 'separados', s.id::text, 'entregar', jsonb_build_object('venta_id', v), auth.uid());
  return v;
end $$;

-- Cancelar: se devuelve lo abonado. Lo recibido en efectivo sale de la caja del turno de quien cancela.
create or replace function cancelar_separado(p_separado uuid, p_motivo text, p_turno uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare s separados%rowtype; efectivo numeric; t turnos_caja%rowtype;
begin
  if coalesce(trim(p_motivo),'') = '' then raise exception 'El motivo es obligatorio'; end if;
  select * into s from separados where id = p_separado for update;
  if not found or s.organizacion_id not in (select mis_organizaciones()) then raise exception 'Separado no existe'; end if;
  if not tiene_rol(s.organizacion_id, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin cancelan separados'; end if;
  if s.estado <> 'activo' then raise exception 'El separado no está activo'; end if;
  select coalesce(sum(monto), 0) into efectivo from abonos_separado where separado_id = s.id and metodo = 'efectivo';
  if efectivo > 0 then
    select * into t from turnos_caja where id = p_turno and organizacion_id = s.organizacion_id;
    if not found or t.estado <> 'abierto' then raise exception 'Para devolver abonos en efectivo necesitas un turno de caja abierto'; end if;
    insert into movimientos_caja (organizacion_id, turno_id, tipo, monto, motivo, usuario_id)
    values (s.organizacion_id, t.id, 'retiro', efectivo, 'Devolución de abonos del separado #' || s.numero, auth.uid());
  end if;
  update separados set estado = 'cancelado', motivo_cancelacion = p_motivo where id = s.id;
  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (s.organizacion_id, 'separados', s.id::text, 'cancelar', jsonb_build_object('motivo', p_motivo, 'devuelto', s.abonado), auth.uid());
end $$;

-- Mercancía reservada por separados activos (para no venderla dos veces).
create or replace function stock_reservado(p_org uuid)
returns table (producto_id uuid, bodega_id uuid, reservado numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_org not in (select mis_organizaciones()) then raise exception 'Sin acceso'; end if;
  return query
  select d.producto_id, s.bodega_id, sum(d.cantidad * coalesce(pr.factor, 1))::numeric
    from separados s
    join separados_detalle d on d.separado_id = s.id
    left join presentaciones pr on pr.id = d.presentacion_id
   where s.organizacion_id = p_org and s.estado = 'activo'
   group by d.producto_id, s.bodega_id;
end $$;

-- ---------------------------------------------------------------------
-- Devoluciones de clientes
-- ---------------------------------------------------------------------
create or replace function registrar_devolucion_cliente(p_venta uuid, p_lineas jsonb, p_motivo text, p_reembolso text,
  p_turno uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v ventas%rowtype; dev uuid; l jsonb; d ventas_detalle%rowtype; cant numeric; ya numeric; factor numeric; valor numeric;
        tot numeric := 0; costo_tot numeric := 0; t turnos_caja%rowtype; cli clientes%rowtype; bono numeric;
begin
  perform set_config('surtix.desde_funcion', 'si', true);
  select * into v from ventas where id = p_venta for update;
  if not found or v.organizacion_id not in (select mis_organizaciones()) then raise exception 'Venta no existe'; end if;
  if not tiene_rol(v.organizacion_id, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then raise exception 'Sin permiso para recibir devoluciones'; end if;
  if v.estado <> 'confirmado' then raise exception 'Solo se devuelve mercancía de ventas confirmadas'; end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'El motivo es obligatorio'; end if;
  if p_reembolso not in ('efectivo','nequi','daviplata','transferencia','tarjeta','otro','abono_deuda') then raise exception 'Forma de reembolso inválida'; end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then raise exception 'Elige qué se devuelve'; end if;

  insert into devoluciones_cliente (organizacion_id, venta_id, turno_id, numero, motivo, reembolso, usuario_id)
  values (v.organizacion_id, v.id, p_turno, siguiente_consecutivo(v.organizacion_id, 'devolucion_cliente'), trim(p_motivo), p_reembolso, auth.uid())
  returning id into dev;

  for l in select * from jsonb_array_elements(p_lineas) loop
    cant := (l->>'cantidad')::numeric;
    if cant is null or cant <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
    select * into d from ventas_detalle where id = (l->>'venta_detalle_id')::uuid and venta_id = v.id;
    if not found then raise exception 'Una línea no pertenece a esta venta'; end if;
    select coalesce(sum(x.cantidad), 0) into ya from devoluciones_cliente_detalle x where x.venta_detalle_id = d.id;
    if ya + cant > d.cantidad then raise exception 'No se puede devolver más de lo vendido (vendido %, ya devuelto %)', d.cantidad, ya; end if;
    select coalesce((select pr.factor from presentaciones pr where pr.id = d.presentacion_id), 1) into factor;
    -- Se valora al precio realmente cobrado (con el descuento proporcional de la línea).
    valor := round(d.subtotal * cant / d.cantidad, 2);
    if (select maneja_inventario from productos where id = d.producto_id) then
      insert into movimientos_inventario (organizacion_id, producto_id, bodega_id, tipo, cantidad, costo_unitario,
        documento_tipo, documento_id, motivo, usuario_id)
      values (v.organizacion_id, d.producto_id, v.bodega_id, 'devolucion_cliente', cant * factor,
              round(coalesce(d.costo_unitario, 0) / factor, 2), 'devolucion_cliente', dev, p_motivo, auth.uid());
    end if;
    insert into devoluciones_cliente_detalle (organizacion_id, devolucion_id, venta_detalle_id, producto_id, cantidad, valor)
    values (v.organizacion_id, dev, d.id, d.producto_id, cant, valor);
    tot := tot + valor;
    costo_tot := costo_tot + round(coalesce(d.costo_unitario, 0) * cant, 2);
  end loop;
  update devoluciones_cliente set total = tot, costo_total = costo_tot where id = dev;

  if p_reembolso = 'efectivo' then
    select * into t from turnos_caja where id = p_turno and organizacion_id = v.organizacion_id;
    if not found or t.estado <> 'abierto' then raise exception 'Para reembolsar en efectivo necesitas un turno de caja abierto'; end if;
    if t.usuario_id <> auth.uid() and not tiene_rol(v.organizacion_id, array['dueno','admin']::rol_miembro[]) then
      raise exception 'Ese turno es de otra persona';
    end if;
    insert into movimientos_caja (organizacion_id, turno_id, tipo, monto, motivo, usuario_id)
    values (v.organizacion_id, t.id, 'retiro', tot, 'Devolución de venta #' || v.numero, auth.uid());
  elsif p_reembolso = 'abono_deuda' then
    if v.cliente_id is null then raise exception 'La venta no tiene cliente: no hay deuda que abonar'; end if;
    select * into cli from clientes where id = v.cliente_id for update;
    bono := least(tot, cli.saldo);
    if bono <= 0 then raise exception 'El cliente no tiene deuda para abonar'; end if;
    update clientes set saldo = saldo - bono where id = cli.id;
  end if;

  -- Una devolución grande o a nombre de quien vende mucho se vigila.
  perform crear_alerta_unica(v.organizacion_id, 'devolucion', dev::text,
    case when tot >= (select umbral_ajuste_alerta from organizaciones where id = v.organizacion_id) then 'alta' else 'baja' end,
    'Devolución de cliente por $ ' || to_char(tot, 'FM999G999G999') || ' (venta #' || v.numero || '): ' || trim(p_motivo),
    jsonb_build_object('devolucion_id', dev, 'venta_id', v.id, 'total', tot));
  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (v.organizacion_id, 'devoluciones_cliente', dev::text, 'crear', jsonb_build_object('total', tot, 'reembolso', p_reembolso), auth.uid());
  perform set_config('surtix.desde_funcion', 'no', true);
  return dev;
end $$;

-- ---------------------------------------------------------------------
-- El efectivo esperado incluye los abonos de separados en efectivo
-- ---------------------------------------------------------------------
create or replace function efectivo_esperado_turno(p_turno uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select t.base_inicial
    + coalesce((select sum(pv.monto) from pagos_venta pv join ventas v on v.id = pv.venta_id
                 where v.turno_id = t.id and v.estado = 'confirmado' and pv.metodo = 'efectivo'), 0)
    + coalesce((select sum(a.monto) from abonos_cliente a where a.turno_id = t.id and a.metodo = 'efectivo'), 0)
    + coalesce((select sum(a.monto) from abonos_separado a where a.turno_id = t.id and a.metodo = 'efectivo'), 0)
    + coalesce((select sum(m.monto) from movimientos_caja m where m.turno_id = t.id and m.tipo = 'ingreso'), 0)
    - coalesce((select sum(m.monto) from movimientos_caja m where m.turno_id = t.id and m.tipo = 'retiro'), 0)
    - coalesce((select sum(g.monto) from gastos g where g.turno_id = t.id and g.estado = 'activo' and g.metodo = 'efectivo'), 0)
  from turnos_caja t
  where t.id = p_turno and t.organizacion_id in (select mis_organizaciones())
$$;

-- ---------------------------------------------------------------------
-- Reporte diario neto de devoluciones (mismas columnas que antes)
-- ---------------------------------------------------------------------
create or replace function reporte_ventas_diarias(p_org uuid, p_desde date, p_hasta date)
returns table (dia date, ventas bigint, total numeric, costo numeric, utilidad numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform reportes_validar(p_org, p_desde, p_hasta);
  return query
  select d::date,
         count(v.id),
         coalesce(sum(v.total), 0)::numeric - coalesce(max(dv.total), 0)::numeric,
         coalesce(sum(v.costo_total), 0)::numeric - coalesce(max(dv.costo), 0)::numeric,
         (coalesce(sum(v.total - v.costo_total), 0) - (coalesce(max(dv.total), 0) - coalesce(max(dv.costo), 0)))::numeric
    from generate_series(p_desde, p_hasta, interval '1 day') d
    left join ventas v on v.organizacion_id = p_org and v.estado = 'confirmado'
                      and (v.creado_en at time zone 'America/Bogota')::date = d::date
    left join lateral (
      select sum(x.total) as total, sum(x.costo_total) as costo from devoluciones_cliente x
       where x.organizacion_id = p_org and (x.creado_en at time zone 'America/Bogota')::date = d::date
    ) dv on true
   group by d
   order by d;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'crear_cotizacion(uuid,uuid,jsonb,date,text)',
    'cambiar_estado_cotizacion(uuid,text,uuid)',
    'crear_separado(uuid,uuid,uuid,jsonb,date,text,numeric,metodo_pago,uuid)',
    'abonar_separado(uuid,numeric,metodo_pago,uuid)',
    'entregar_separado(uuid,jsonb,uuid)',
    'cancelar_separado(uuid,text,uuid)',
    'stock_reservado(uuid)',
    'registrar_devolucion_cliente(uuid,jsonb,text,text,uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
