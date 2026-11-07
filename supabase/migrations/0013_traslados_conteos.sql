-- 0013: multi-bodega con traslados y conteo físico guiado (Fase 2: 2.1 y 2.2)
--
--  * trasladar_inventario: mueve mercancía entre bodegas de forma atómica. La salida usa el costo promedio
--    del origen y la entrada llega al destino con ESE costo (el valor total del inventario no cambia).
--  * anular_traslado: devuelve la mercancía con movimientos contrarios (si el destino aún la tiene).
--  * conteos: inventario físico "ciego". Cada línea guarda lo que el sistema tenía en el momento de contarla,
--    así las ventas que ocurren durante el conteo no generan diferencias falsas.

create table traslados (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  bodega_origen_id uuid not null references bodegas(id),
  bodega_destino_id uuid not null references bodegas(id),
  numero bigint,
  nota text,
  estado text not null default 'completado' check (estado in ('completado','anulado')),
  motivo_anulacion text,
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  check (bodega_origen_id <> bodega_destino_id),
  unique (organizacion_id, numero)
);

create table traslados_detalle (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  traslado_id uuid not null references traslados(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad numeric(14,3) not null check (cantidad > 0),
  costo_unitario numeric(14,2) not null default 0
);
create index on traslados_detalle (traslado_id);

create table conteos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  bodega_id uuid not null references bodegas(id),
  nombre text not null,
  categoria_id uuid references categorias(id),
  estado text not null default 'en_curso' check (estado in ('en_curso','cerrado','cancelado')),
  ajustes_aplicados boolean not null default false,
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  cerrado_en timestamptz
);

create table conteos_detalle (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  conteo_id uuid not null references conteos(id) on delete cascade,
  producto_id uuid not null references productos(id),
  cantidad_contada numeric(14,3) check (cantidad_contada >= 0),
  cantidad_sistema numeric(14,3),
  costo_unitario numeric(14,2),
  contado_por uuid references auth.users(id),
  contado_en timestamptz,
  unique (conteo_id, producto_id)
);
create index on conteos_detalle (conteo_id);

do $$
declare t text;
begin
  foreach t in array array['traslados','traslados_detalle','conteos','conteos_detalle'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (organizacion_id in (select mis_organizaciones()))', t || '_leer', t);
  end loop;
end $$;
-- Solo se escribe con las funciones de abajo.

create trigger trg_misma_org before insert or update on traslados
  for each row execute function exigir_misma_organizacion('bodega_origen_id:bodegas', 'bodega_destino_id:bodegas');
create trigger trg_misma_org before insert or update on traslados_detalle
  for each row execute function exigir_misma_organizacion('producto_id:productos', 'traslado_id:traslados');
create trigger trg_misma_org before insert or update on conteos
  for each row execute function exigir_misma_organizacion('bodega_id:bodegas');
create trigger trg_misma_org before insert or update on conteos_detalle
  for each row execute function exigir_misma_organizacion('producto_id:productos', 'conteo_id:conteos');

-- ---------------------------------------------------------------------
-- Traslados
-- ---------------------------------------------------------------------
create or replace function trasladar_inventario(p_org uuid, p_origen uuid, p_destino uuid, p_lineas jsonb, p_nota text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare tr uuid; l jsonb; prod uuid; cant numeric; costo numeric; n int := 0;
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero']::rol_miembro[]) then
    raise exception 'Sin permiso para trasladar inventario';
  end if;
  if p_origen = p_destino then raise exception 'La bodega de origen y la de destino deben ser distintas'; end if;
  if (select count(*) from bodegas where id in (p_origen, p_destino) and organizacion_id = p_org and activa) <> 2 then
    raise exception 'Bodega no existe o está inactiva';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos un producto al traslado';
  end if;

  insert into traslados (organizacion_id, bodega_origen_id, bodega_destino_id, numero, nota, usuario_id)
  values (p_org, p_origen, p_destino, siguiente_consecutivo(p_org, 'traslado'), nullif(trim(p_nota), ''), auth.uid())
  returning id into tr;

  for l in select * from jsonb_array_elements(p_lineas) loop
    prod := (l->>'producto_id')::uuid;
    cant := (l->>'cantidad')::numeric;
    if cant is null or cant <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
    if not exists (select 1 from productos where id = prod and organizacion_id = p_org and maneja_inventario) then
      raise exception 'Producto no válido para trasladar';
    end if;

    -- No se puede enviar lo que no se tiene, aunque el negocio permita vender con stock negativo.
    if coalesce((select e.cantidad from existencias e where e.producto_id = prod and e.bodega_id = p_origen), 0) < cant then
      raise exception 'No hay suficiente stock de "%" en la bodega de origen',
        (select nombre from productos where id = prod);
    end if;

    -- Salida del origen: el trigger calcula el costo promedio del origen.
    insert into movimientos_inventario (organizacion_id, producto_id, bodega_id, tipo, cantidad,
      documento_tipo, documento_id, motivo, usuario_id)
    values (p_org, prod, p_origen, 'traslado_salida', cant, 'traslado', tr, 'Traslado', auth.uid())
    returning costo_unitario into costo;

    -- Entrada al destino con el mismo costo: el valor total del inventario no cambia.
    insert into movimientos_inventario (organizacion_id, producto_id, bodega_id, tipo, cantidad, costo_unitario,
      documento_tipo, documento_id, motivo, usuario_id)
    values (p_org, prod, p_destino, 'traslado_entrada', cant, costo, 'traslado', tr, 'Traslado', auth.uid());

    insert into traslados_detalle (organizacion_id, traslado_id, producto_id, cantidad, costo_unitario)
    values (p_org, tr, prod, cant, costo);
    n := n + 1;
  end loop;

  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (p_org, 'traslados', tr::text, 'crear', jsonb_build_object('productos', n, 'origen', p_origen, 'destino', p_destino), auth.uid());
  return tr;
end $$;

create or replace function anular_traslado(p_traslado uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare t traslados%rowtype; d record;
begin
  perform set_config('surtix.desde_funcion', 'si', true);
  if coalesce(trim(p_motivo),'') = '' then raise exception 'El motivo es obligatorio'; end if;
  select * into t from traslados where id = p_traslado for update;
  if not found then raise exception 'Traslado no existe'; end if;
  if not tiene_rol(t.organizacion_id, array['dueno','admin']::rol_miembro[]) then
    raise exception 'Solo dueño o admin anulan traslados';
  end if;
  if t.estado <> 'completado' then raise exception 'El traslado ya está anulado'; end if;

  for d in select * from traslados_detalle where traslado_id = t.id loop
    -- Devuelve del destino al origen, solo si el destino todavía tiene esa mercancía.
    if coalesce((select e.cantidad from existencias e where e.producto_id = d.producto_id and e.bodega_id = t.bodega_destino_id), 0) < d.cantidad then
      raise exception 'La bodega de destino ya no tiene la mercancía de este traslado: no se puede anular';
    end if;
    insert into movimientos_inventario (organizacion_id, producto_id, bodega_id, tipo, cantidad,
      documento_tipo, documento_id, motivo, usuario_id)
    values (t.organizacion_id, d.producto_id, t.bodega_destino_id, 'anulacion_salida', d.cantidad,
            'traslado', t.id, p_motivo, auth.uid());
    insert into movimientos_inventario (organizacion_id, producto_id, bodega_id, tipo, cantidad, costo_unitario,
      documento_tipo, documento_id, motivo, usuario_id)
    values (t.organizacion_id, d.producto_id, t.bodega_origen_id, 'anulacion_entrada', d.cantidad, d.costo_unitario,
            'traslado', t.id, p_motivo, auth.uid());
  end loop;

  update traslados set estado = 'anulado', motivo_anulacion = p_motivo where id = t.id;
  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (t.organizacion_id, 'traslados', t.id::text, 'anular', jsonb_build_object('motivo', p_motivo), auth.uid());
  perform set_config('surtix.desde_funcion', 'no', true);
end $$;

-- ---------------------------------------------------------------------
-- Conteo físico
-- ---------------------------------------------------------------------
create or replace function iniciar_conteo(p_org uuid, p_bodega uuid, p_nombre text, p_categoria uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid; n int;
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero']::rol_miembro[]) then
    raise exception 'Sin permiso para hacer conteos';
  end if;
  if not exists (select 1 from bodegas where id = p_bodega and organizacion_id = p_org and activa) then
    raise exception 'Bodega no existe o está inactiva';
  end if;
  if coalesce(trim(p_nombre),'') = '' then raise exception 'El conteo necesita un nombre'; end if;
  if exists (select 1 from conteos where organizacion_id = p_org and bodega_id = p_bodega and estado = 'en_curso'
               and categoria_id is not distinct from p_categoria) then
    raise exception 'Ya hay un conteo en curso para esa bodega';
  end if;

  insert into conteos (organizacion_id, bodega_id, nombre, categoria_id, usuario_id)
  values (p_org, p_bodega, trim(p_nombre), p_categoria, auth.uid()) returning id into c;

  insert into conteos_detalle (organizacion_id, conteo_id, producto_id)
  select p_org, c, p.id from productos p
   where p.organizacion_id = p_org and p.activo and p.maneja_inventario
     and (p_categoria is null or p.categoria_id = p_categoria);
  get diagnostics n = row_count;
  if n = 0 then raise exception 'No hay productos para contar'; end if;
  return c;
end $$;

-- Registra lo contado de un producto; guarda lo que el sistema tenía en ESE momento.
create or replace function registrar_conteo_producto(p_conteo uuid, p_producto uuid, p_cantidad numeric)
returns numeric
language plpgsql security definer set search_path = public as $$
declare c conteos%rowtype; sistema numeric; costo numeric;
begin
  select * into c from conteos where id = p_conteo for update;
  if not found or c.organizacion_id not in (select mis_organizaciones()) then raise exception 'Conteo no existe'; end if;
  if not tiene_rol(c.organizacion_id, array['dueno','admin','bodeguero']::rol_miembro[]) then
    raise exception 'Sin permiso para hacer conteos';
  end if;
  if c.estado <> 'en_curso' then raise exception 'El conteo ya está cerrado'; end if;
  if p_cantidad is null or p_cantidad < 0 then raise exception 'La cantidad contada no es válida'; end if;
  select coalesce(e.cantidad, 0), coalesce(e.costo_promedio, 0) into sistema, costo
    from (select 1) x left join existencias e on e.producto_id = p_producto and e.bodega_id = c.bodega_id;
  update conteos_detalle set cantidad_contada = p_cantidad, cantidad_sistema = sistema, costo_unitario = costo,
         contado_por = auth.uid(), contado_en = now()
   where conteo_id = c.id and producto_id = p_producto;
  if not found then raise exception 'Ese producto no está en este conteo'; end if;
  return p_cantidad - sistema;
end $$;

-- Cierra el conteo. Con p_aplicar = true corrige el inventario con ajustes (movimientos) y deja auditoría.
create or replace function cerrar_conteo(p_conteo uuid, p_aplicar boolean default false) returns integer
language plpgsql security definer set search_path = public as $$
declare c conteos%rowtype; d record; diff numeric; n int := 0; faltante_valor numeric := 0; umbral numeric;
begin
  select * into c from conteos where id = p_conteo for update;
  if not found then raise exception 'Conteo no existe'; end if;
  if not tiene_rol(c.organizacion_id, array['dueno','admin']::rol_miembro[]) then
    raise exception 'Solo dueño o admin cierran conteos';
  end if;
  if c.estado <> 'en_curso' then raise exception 'El conteo ya está cerrado'; end if;

  for d in select * from conteos_detalle where conteo_id = c.id and cantidad_contada is not null loop
    diff := d.cantidad_contada - d.cantidad_sistema;
    if diff = 0 then continue; end if;
    n := n + 1;
    if diff < 0 then faltante_valor := faltante_valor + abs(diff) * coalesce(d.costo_unitario, 0); end if;
    if p_aplicar then
      perform ajustar_inventario(c.organizacion_id, d.producto_id, c.bodega_id, diff,
                                 'Conteo físico: ' || c.nombre, coalesce(d.costo_unitario, 0));
    end if;
  end loop;

  update conteos set estado = 'cerrado', ajustes_aplicados = p_aplicar, cerrado_en = now() where id = c.id;
  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (c.organizacion_id, 'conteos', c.id::text, 'cerrar',
          jsonb_build_object('diferencias', n, 'aplicado', p_aplicar, 'valor_faltante', faltante_valor), auth.uid());

  select umbral_ajuste_alerta into umbral from organizaciones where id = c.organizacion_id;
  if faltante_valor >= umbral then
    perform crear_alerta_unica(c.organizacion_id, 'faltante_inventario', c.id::text, 'alta',
      'El conteo "' || c.nombre || '" encontró faltantes por $ ' || to_char(faltante_valor, 'FM999G999G999'),
      jsonb_build_object('conteo_id', c.id, 'valor_faltante', faltante_valor));
  end if;
  return n;
end $$;

create or replace function cancelar_conteo(p_conteo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c conteos%rowtype;
begin
  select * into c from conteos where id = p_conteo for update;
  if not found then raise exception 'Conteo no existe'; end if;
  if not tiene_rol(c.organizacion_id, array['dueno','admin']::rol_miembro[]) then
    raise exception 'Solo dueño o admin cancelan conteos';
  end if;
  if c.estado <> 'en_curso' then raise exception 'El conteo ya está cerrado'; end if;
  update conteos set estado = 'cancelado', cerrado_en = now() where id = c.id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'trasladar_inventario(uuid,uuid,uuid,jsonb,text)',
    'anular_traslado(uuid,text)',
    'iniciar_conteo(uuid,uuid,text,uuid)',
    'registrar_conteo_producto(uuid,uuid,numeric)',
    'cerrar_conteo(uuid,boolean)',
    'cancelar_conteo(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
