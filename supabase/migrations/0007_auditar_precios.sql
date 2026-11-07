-- 0007: auditoría de cambios de precio en el POS.
-- `auditoria` no admite INSERT directo de usuarios (solo funciones security definer), así que el
-- POS registra los cambios de precio por esta función. Valida que la venta sea del usuario y del negocio.

create or replace function registrar_cambio_precio(p_venta uuid, p_cambios jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v ventas%rowtype;
begin
  select * into v from ventas where id = p_venta;
  if not found or v.organizacion_id not in (select mis_organizaciones()) then
    raise exception 'Venta no existe';
  end if;
  if v.usuario_id is distinct from auth.uid()
     and not tiene_rol(v.organizacion_id, array['dueno','admin']::rol_miembro[]) then
    raise exception 'Sin permiso';
  end if;
  if jsonb_typeof(p_cambios) <> 'array' or jsonb_array_length(p_cambios) = 0 then
    raise exception 'Cambios inválidos';
  end if;
  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (v.organizacion_id, 'ventas', v.id::text, 'precio_modificado',
          jsonb_build_object('cambios', p_cambios), auth.uid());
end $$;

revoke all on function registrar_cambio_precio(uuid, jsonb) from public, anon;
grant execute on function registrar_cambio_precio(uuid, jsonb) to authenticated;
