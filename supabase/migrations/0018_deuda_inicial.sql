-- 0018: deudas iniciales de clientes (Fase 2: 2.12 — cuaderno de fiados → deudas)
-- El saldo de un cliente nunca se edita a mano (lo mantienen ventas y abonos). Las deudas que el negocio ya
-- tenía en su cuaderno entran por esta función, que deja constancia en `ajustes_cartera` y en auditoría.

create table ajustes_cartera (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  cliente_id uuid not null references clientes(id),
  monto numeric(14,2) not null check (monto <> 0),
  motivo text not null,
  documento_ia_id uuid,
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
alter table ajustes_cartera enable row level security;
create policy ajustes_cartera_leer on ajustes_cartera for select using (organizacion_id in (select mis_organizaciones()));
create trigger trg_misma_org before insert or update on ajustes_cartera
  for each row execute function exigir_misma_organizacion('cliente_id:clientes');

create or replace function registrar_deuda_inicial(p_cliente uuid, p_monto numeric, p_motivo text default 'Deuda anterior del cuaderno',
  p_documento_ia uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare c clientes%rowtype; nuevo uuid;
begin
  perform set_config('surtix.desde_funcion', 'si', true);
  select * into c from clientes where id = p_cliente for update;
  if not found or c.organizacion_id not in (select mis_organizaciones()) then raise exception 'Cliente no existe'; end if;
  if not tiene_rol(c.organizacion_id, array['dueno','admin']::rol_miembro[]) then
    raise exception 'Solo dueño o admin registran deudas anteriores';
  end if;
  if p_monto is null or p_monto <= 0 then raise exception 'La deuda debe ser mayor a cero'; end if;
  if p_monto > 999999999 then raise exception 'La deuda es demasiado grande'; end if;
  insert into ajustes_cartera (organizacion_id, cliente_id, monto, motivo, documento_ia_id, usuario_id)
  values (c.organizacion_id, c.id, p_monto, coalesce(nullif(trim(p_motivo), ''), 'Deuda anterior'), p_documento_ia, auth.uid())
  returning id into nuevo;
  update clientes set saldo = saldo + p_monto where id = c.id;
  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (c.organizacion_id, 'clientes', c.id::text, 'deuda_inicial', jsonb_build_object('monto', p_monto, 'motivo', p_motivo), auth.uid());
  perform set_config('surtix.desde_funcion', 'no', true);
  return nuevo;
end $$;
revoke all on function registrar_deuda_inicial(uuid, numeric, text, uuid) from public, anon;
grant execute on function registrar_deuda_inicial(uuid, numeric, text, uuid) to authenticated;
