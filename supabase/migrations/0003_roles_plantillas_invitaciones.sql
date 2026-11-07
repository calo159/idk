-- =====================================================================
-- 0003 — Roles en escritura, anular_compra, plantillas de nicho, invitaciones
--
-- 1. Las políticas de escritura de 0001 dejaban escribir a cualquier miembro (incluido el contador,
--    que es solo lectura). Se reemplazan por políticas con rol.
-- 2. Se permite borrar LÍNEAS y BORRADORES (nunca documentos confirmados) para editar borradores.
-- 3. registrar_abono valida rol.
-- 4. anular_compra (regla #4: los documentos se anulan, no se borran).
-- 5. Plantillas por nicho y crear_organizacion las aplica.
-- 6. Invitaciones de usuarios con rol + protección de los dueños.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1 y 2. Políticas de escritura por rol
-- ---------------------------------------------------------------------
do $$
declare t text; pol record;
begin
  -- Quitar las políticas genéricas de insert/update de 0001
  foreach t in array array[
    'bodegas','categorias','productos','presentaciones','proveedores','clientes','turnos_caja',
    'compras','compras_detalle','ventas','ventas_detalle','comprobantes','pagos_venta',
    'documentos_ia','alertas'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_crear', t);
    execute format('drop policy if exists %I on %I', t || '_editar', t);
  end loop;
end $$;

create or replace function roles_escritura(tabla text) returns rol_miembro[]
language sql immutable as $$
  select case tabla
    when 'bodegas'         then array['dueno','admin']
    when 'categorias'      then array['dueno','admin','bodeguero']
    when 'productos'       then array['dueno','admin','bodeguero']
    when 'presentaciones'  then array['dueno','admin','bodeguero']
    when 'proveedores'     then array['dueno','admin','bodeguero']
    when 'compras'         then array['dueno','admin','bodeguero']
    when 'compras_detalle' then array['dueno','admin','bodeguero']
    when 'clientes'        then array['dueno','admin','vendedor','ruta']
    when 'turnos_caja'     then array['dueno','admin','vendedor','ruta']
    when 'ventas'          then array['dueno','admin','vendedor','ruta']
    when 'ventas_detalle'  then array['dueno','admin','vendedor','ruta']
    when 'pagos_venta'     then array['dueno','admin','vendedor','ruta']
    when 'comprobantes'    then array['dueno','admin','vendedor','ruta','bodeguero']
    when 'documentos_ia'   then array['dueno','admin','vendedor','bodeguero']
    else array['dueno']
  end::rol_miembro[]
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'bodegas','categorias','productos','presentaciones','proveedores','clientes',
    'compras','compras_detalle','ventas','ventas_detalle','comprobantes','pagos_venta','documentos_ia'
  ] loop
    execute format('create policy %I on %I for insert with check (tiene_rol(organizacion_id, roles_escritura(%L)))',
                   t || '_crear', t, t);
    execute format('create policy %I on %I for update using (tiene_rol(organizacion_id, roles_escritura(%L)))
                    with check (tiene_rol(organizacion_id, roles_escritura(%L)))', t || '_editar', t, t, t);
  end loop;

  -- Turnos: se abren a nombre propio; se cierran SOLO con cerrar_turno (security definer)
  create policy turnos_caja_crear on turnos_caja for insert
    with check (tiene_rol(organizacion_id, roles_escritura('turnos_caja')) and usuario_id = auth.uid());

  -- Alertas: el dueño/admin las marca como leídas; las crea el sistema (funciones / servidor)
  create policy alertas_editar on alertas for update
    using (tiene_rol(organizacion_id, array['dueno','admin']::rol_miembro[]))
    with check (tiene_rol(organizacion_id, array['dueno','admin']::rol_miembro[]));

  -- Borrar solo líneas/pagos de BORRADORES (el trigger proteger_detalle ya bloquea los confirmados)
  -- y borradores completos.
  create policy ventas_detalle_borrar on ventas_detalle for delete
    using (tiene_rol(organizacion_id, roles_escritura('ventas_detalle')));
  create policy pagos_venta_borrar on pagos_venta for delete
    using (tiene_rol(organizacion_id, roles_escritura('pagos_venta')));
  create policy compras_detalle_borrar on compras_detalle for delete
    using (tiene_rol(organizacion_id, roles_escritura('compras_detalle')));
  create policy ventas_borrar_borrador on ventas for delete
    using (estado = 'borrador' and tiene_rol(organizacion_id, roles_escritura('ventas')));
  create policy compras_borrar_borrador on compras for delete
    using (estado = 'borrador' and tiene_rol(organizacion_id, roles_escritura('compras')));
end $$;

-- ---------------------------------------------------------------------
-- 3. registrar_abono con validación de rol
-- ---------------------------------------------------------------------
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
  if not tiene_rol(cli.organizacion_id, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then
    raise exception 'Sin permiso para registrar abonos';
  end if;
  if p_metodo = 'credito' then raise exception 'Un abono no puede ser a crédito'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El abono debe ser mayor a cero'; end if;
  if p_monto > cli.saldo then
    raise exception 'El abono (%) supera la deuda del cliente (%)', p_monto, cli.saldo;
  end if;
  insert into abonos_cliente (organizacion_id, cliente_id, turno_id, metodo, monto, usuario_id)
  values (cli.organizacion_id, cli.id, p_turno, p_metodo, p_monto, auth.uid()) returning id into nuevo;
  update clientes set saldo = saldo - p_monto where id = cli.id;
  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (cli.organizacion_id, 'clientes', cli.id::text, 'abono',
          jsonb_build_object('monto', p_monto, 'metodo', p_metodo), auth.uid());
  perform set_config('surtix.desde_funcion', 'no', true);
  return nuevo;
end $$;

-- ---------------------------------------------------------------------
-- 4. anular_compra
-- ---------------------------------------------------------------------
create or replace function anular_compra(p_compra_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare c compras%rowtype; m record;
begin
  perform set_config('surtix.desde_funcion', 'si', true);
  if coalesce(trim(p_motivo),'') = '' then raise exception 'El motivo es obligatorio'; end if;
  select * into c from compras where id = p_compra_id for update;
  if not found then raise exception 'Compra no existe'; end if;
  if not tiene_rol(c.organizacion_id, array['dueno','admin']::rol_miembro[]) then
    raise exception 'Solo dueño o admin pueden anular compras';
  end if;
  if c.estado <> 'confirmado' then raise exception 'Solo se anulan compras confirmadas'; end if;

  for m in select * from movimientos_inventario
           where documento_tipo = 'compra' and documento_id = c.id and tipo = 'compra' loop
    insert into movimientos_inventario (organizacion_id, producto_id, bodega_id, tipo, cantidad,
      costo_unitario, documento_tipo, documento_id, motivo, usuario_id)
    values (m.organizacion_id, m.producto_id, m.bodega_id, 'anulacion_salida', m.cantidad,
      m.costo_unitario, 'compra', c.id, p_motivo, auth.uid());
  end loop;

  -- una compra anulada no cuenta para el comparador de proveedores
  delete from precios_proveedor where compra_id = c.id;

  update compras set estado = 'anulado', motivo_anulacion = p_motivo where id = c.id;

  insert into auditoria (organizacion_id, tabla, registro_id, accion, antes, despues, usuario_id)
  values (c.organizacion_id, 'compras', c.id::text, 'anular',
          jsonb_build_object('estado','confirmado','total',c.total),
          jsonb_build_object('estado','anulado','motivo',p_motivo), auth.uid());
  insert into eventos_outbox (organizacion_id, tipo, payload)
  values (c.organizacion_id, 'compra.anulada',
          jsonb_build_object('compra_id', c.id, 'total', c.total, 'motivo', p_motivo));
  perform set_config('surtix.desde_funcion', 'no', true);
end $$;

-- ---------------------------------------------------------------------
-- 5. Plantillas por nicho
-- ---------------------------------------------------------------------
create or replace function aplicar_plantilla_nicho(p_org uuid, p_nicho text) returns void
language plpgsql security definer set search_path = public as $$
declare cats text[];
begin
  cats := case p_nicho
    when 'ferreteria' then array['Herramientas manuales','Herramientas eléctricas','Tornillería y fijaciones',
      'Plomería','Electricidad','Pinturas y acabados','Cemento y construcción','Cerrajería','Tuberías y accesorios',
      'Seguridad industrial','Jardinería','Otros']
    when 'ropa' then array['Camisetas','Pantalones','Vestidos y faldas','Ropa interior','Calzado','Accesorios',
      'Ropa deportiva','Niños','Otros']
    when 'viveres' then array['Granos y cereales','Aceites y grasas','Enlatados','Lácteos y huevos','Carnes y embutidos',
      'Bebidas','Aseo del hogar','Aseo personal','Snacks y dulces','Panadería','Otros']
    when 'veterinaria' then array['Alimento para perros','Alimento para gatos','Medicamentos','Vacunas',
      'Antiparasitarios','Accesorios','Higiene','Agroinsumos','Otros']
    else array['General']
  end;
  insert into categorias (organizacion_id, nombre)
  select p_org, unnest(cats) on conflict (organizacion_id, nombre) do nothing;
end $$;

create or replace function crear_organizacion(p_nombre text, p_nicho text, p_nombre_dueno text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare org uuid; nicho text := coalesce(nullif(trim(p_nicho),''), 'general');
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if coalesce(trim(p_nombre),'') = '' then raise exception 'El nombre del negocio es obligatorio'; end if;
  if nicho not in ('ferreteria','ropa','viveres','veterinaria','general') then
    raise exception 'Nicho inválido';
  end if;
  perform set_config('surtix.desde_funcion', 'si', true);
  insert into organizaciones (nombre, nicho) values (trim(p_nombre), nicho) returning id into org;
  insert into miembros (organizacion_id, usuario_id, rol, nombre) values (org, auth.uid(), 'dueno', trim(p_nombre_dueno));
  insert into bodegas (organizacion_id, nombre, es_principal) values (org, 'Principal', true);
  perform aplicar_plantilla_nicho(org, nicho);
  insert into auditoria (organizacion_id, tabla, registro_id, accion, usuario_id)
  values (org, 'organizaciones', org::text, 'crear', auth.uid());
  perform set_config('surtix.desde_funcion', 'no', true);
  return org;
end $$;

-- ---------------------------------------------------------------------
-- 6. Invitaciones y protección de dueños
-- ---------------------------------------------------------------------
create table invitaciones (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  correo text not null,
  rol rol_miembro not null check (rol <> 'dueno'),
  nombre text,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  creado_por uuid references auth.users(id),
  expira_en timestamptz not null default now() + interval '7 days',
  aceptada_en timestamptz,
  creado_en timestamptz not null default now()
);
create index on invitaciones (organizacion_id, creado_en desc);
alter table invitaciones enable row level security;
create policy invitaciones_leer on invitaciones for select
  using (tiene_rol(organizacion_id, array['dueno','admin']::rol_miembro[]));
create policy invitaciones_crear on invitaciones for insert
  with check (tiene_rol(organizacion_id, array['dueno','admin']::rol_miembro[]) and creado_por = auth.uid());
create policy invitaciones_borrar on invitaciones for delete
  using (tiene_rol(organizacion_id, array['dueno','admin']::rol_miembro[]) and aceptada_en is null);

-- Acepta una invitación: el correo de la sesión debe coincidir con el de la invitación.
create or replace function aceptar_invitacion(p_token text, p_nombre text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv invitaciones%rowtype; correo_usuario text;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  select * into inv from invitaciones where token = p_token for update;
  if not found then raise exception 'Invitación no válida'; end if;
  if inv.aceptada_en is not null then raise exception 'La invitación ya fue usada'; end if;
  if inv.expira_en < now() then raise exception 'La invitación venció'; end if;
  select lower(email) into correo_usuario from auth.users where id = auth.uid();
  if correo_usuario is distinct from lower(inv.correo) then
    raise exception 'Esta invitación es para otro correo';
  end if;
  perform set_config('surtix.desde_funcion', 'si', true);
  insert into miembros (organizacion_id, usuario_id, rol, nombre)
  values (inv.organizacion_id, auth.uid(), inv.rol, coalesce(nullif(trim(p_nombre),''), inv.nombre, inv.correo))
  on conflict (organizacion_id, usuario_id) do update set rol = excluded.rol, activo = true;
  update invitaciones set aceptada_en = now() where id = inv.id;
  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (inv.organizacion_id, 'miembros', auth.uid()::text, 'invitacion_aceptada',
          jsonb_build_object('rol', inv.rol), auth.uid());
  perform set_config('surtix.desde_funcion', 'no', true);
  return inv.organizacion_id;
end $$;

-- Solo un dueño toca a los dueños; nunca puede quedar un negocio sin dueño activo.
create or replace function proteger_miembros() returns trigger
language plpgsql security definer set search_path = public as $$
declare org uuid := coalesce(new.organizacion_id, old.organizacion_id);
begin
  if desde_funcion() or auth.uid() is null then return coalesce(new, old); end if;
  if (tg_op <> 'DELETE' and new.rol = 'dueno') or (tg_op <> 'INSERT' and old.rol = 'dueno') then
    if not tiene_rol(org, array['dueno']::rol_miembro[]) then
      raise exception 'Solo un dueño puede asignar o cambiar dueños';
    end if;
  end if;
  if tg_op <> 'INSERT' and old.rol = 'dueno' and old.activo
     and (tg_op = 'DELETE' or new.rol <> 'dueno' or not new.activo) then
    if not exists (select 1 from miembros where organizacion_id = org and rol = 'dueno' and activo
                   and usuario_id <> old.usuario_id) then
      raise exception 'El negocio debe tener al menos un dueño activo';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_proteger_miembros before insert or update or delete on miembros
  for each row execute function proteger_miembros();
