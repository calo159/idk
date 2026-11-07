-- 0009: carga de inventario inicial en bloque (importación desde Excel).
-- Sigue la regla #1: el stock solo cambia con movimientos. Cada línea es un movimiento tipo 'inicial'
-- con su costo, dentro de una sola transacción. Si una línea falla, no se carga ninguna.

create or replace function cargar_inventario_inicial(p_org uuid, p_bodega uuid, p_lineas jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare l jsonb; n integer := 0; cant numeric; costo numeric; prod uuid;
begin
  if not tiene_rol(p_org, array['dueno','admin','bodeguero']::rol_miembro[]) then
    raise exception 'Sin permiso para cargar inventario';
  end if;
  if not exists (select 1 from bodegas where id = p_bodega and organizacion_id = p_org) then
    raise exception 'Bodega no existe';
  end if;
  if jsonb_typeof(p_lineas) <> 'array' then raise exception 'Líneas inválidas'; end if;
  if jsonb_array_length(p_lineas) > 5000 then raise exception 'Máximo 5000 productos por carga'; end if;

  for l in select * from jsonb_array_elements(p_lineas) loop
    prod := (l->>'producto_id')::uuid;
    cant := (l->>'cantidad')::numeric;
    costo := coalesce((l->>'costo')::numeric, 0);
    if cant is null or cant <= 0 then continue; end if;
    if costo < 0 then raise exception 'El costo no puede ser negativo'; end if;
    if not exists (select 1 from productos where id = prod and organizacion_id = p_org) then
      raise exception 'Producto no pertenece al negocio';
    end if;
    insert into movimientos_inventario (organizacion_id, producto_id, bodega_id, tipo, cantidad,
      costo_unitario, documento_tipo, motivo, usuario_id)
    values (p_org, prod, p_bodega, 'inicial', cant, costo, 'importacion', 'Inventario inicial (importación)', auth.uid());
    n := n + 1;
  end loop;

  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (p_org, 'existencias', p_bodega::text, 'inventario_inicial',
          jsonb_build_object('productos', n), auth.uid());
  return n;
end $$;

revoke all on function cargar_inventario_inicial(uuid, uuid, jsonb) from public, anon;
grant execute on function cargar_inventario_inicial(uuid, uuid, jsonb) to authenticated;
