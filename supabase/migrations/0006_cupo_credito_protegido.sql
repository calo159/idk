-- 0006: el cupo de crédito solo lo fijan el dueño y el administrador.
-- Antes, cualquier vendedor con permiso de editar clientes podía subirse el cupo a sí mismo
-- (o al de un amigo) llamando a la API directamente.
-- Sin sesión (auth.uid() nulo: service role, seeds, n8n) no se restringe.

create or replace function proteger_cupo_credito() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and new.cupo_credito <> 0 and not tiene_rol(new.organizacion_id, array['dueno','admin']::rol_miembro[]) then
      raise exception 'Solo el dueño o un administrador define el cupo de crédito';
    end if;
  elsif new.cupo_credito is distinct from old.cupo_credito then
    if auth.uid() is not null and not tiene_rol(new.organizacion_id, array['dueno','admin']::rol_miembro[]) then
      raise exception 'Solo el dueño o un administrador define el cupo de crédito';
    end if;
    insert into auditoria (organizacion_id, tabla, registro_id, accion, antes, despues, usuario_id)
    values (new.organizacion_id, 'clientes', new.id::text, 'cambio_cupo',
            jsonb_build_object('cupo_credito', old.cupo_credito),
            jsonb_build_object('cupo_credito', new.cupo_credito), auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists trg_proteger_cupo on clientes;
create trigger trg_proteger_cupo before insert or update on clientes
  for each row execute function proteger_cupo_credito();
