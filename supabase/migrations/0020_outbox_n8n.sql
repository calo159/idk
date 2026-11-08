-- 0020: outbox listo para n8n (Fase 3: 3.1)
--  * Cada alerta nueva (tabla `alertas`) emite un evento `alerta.creada`, para que n8n la avise por WhatsApp.
--  * `reclamar_eventos` entrega eventos pendientes a UN solo consumidor a la vez (SKIP LOCKED + arrendamiento de 2 min),
--    cuenta los intentos y descarta duplicados (stock.bajo del mismo producto en el mismo día) y los eventos que ya
--    cubre una alerta (comprobante.sospechoso).
--  * `finalizar_evento` marca como procesado o deja el error; tras 5 intentos el evento queda "muerto" para revisión.
-- Solo el service role puede ejecutarlas: las llama el servidor de Surtix con el token de n8n, nunca el navegador.

alter table eventos_outbox
  add column if not exists error text,
  add column if not exists bloqueado_hasta timestamptz;
create index if not exists eventos_outbox_pendientes on eventos_outbox (id) where procesado_en is null;

create or replace function emitir_evento_alerta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into eventos_outbox (organizacion_id, tipo, payload)
  values (new.organizacion_id, 'alerta.creada',
          jsonb_build_object('alerta_id', new.id, 'tipo_alerta', new.tipo, 'severidad', new.severidad,
                             'mensaje', new.mensaje, 'datos', coalesce(new.datos, '{}'::jsonb)));
  return new;
end $$;
create trigger trg_emitir_evento_alerta after insert on alertas
  for each row execute function emitir_evento_alerta();

create or replace function reclamar_eventos(p_limite integer default 50)
returns table (id bigint, organizacion_id uuid, organizacion text, telefono_whatsapp text, tipo text, payload jsonb,
               intentos integer, creado_en timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if p_limite is null or p_limite < 1 or p_limite > 500 then raise exception 'El límite debe estar entre 1 y 500'; end if;

  -- Eventos que ya cubre una alerta: no se avisan dos veces.
  update eventos_outbox e set procesado_en = now(), error = 'cubierto por una alerta'
   where e.procesado_en is null and e.tipo = 'comprobante.sospechoso';

  -- stock.bajo / stock.negativo del mismo producto: un aviso por día (el primero).
  update eventos_outbox e set procesado_en = now(), error = 'duplicado del día'
   where e.procesado_en is null and e.tipo in ('stock.bajo', 'stock.negativo')
     and exists (
       select 1 from eventos_outbox o
        where o.organizacion_id = e.organizacion_id and o.tipo = e.tipo and o.id < e.id
          and o.payload->>'producto_id' = e.payload->>'producto_id'
          and (o.creado_en at time zone 'America/Bogota')::date = (e.creado_en at time zone 'America/Bogota')::date);

  return query
  with elegidos as (
    select eo.id from eventos_outbox eo
     where eo.procesado_en is null and eo.intentos < 5 and (eo.bloqueado_hasta is null or eo.bloqueado_hasta < now())
     order by eo.id
     limit p_limite
     for update skip locked
  ), marcados as (
    update eventos_outbox eo set intentos = eo.intentos + 1, bloqueado_hasta = now() + interval '2 minutes'
      from elegidos where eo.id = elegidos.id
    returning eo.id, eo.organizacion_id, eo.tipo, eo.payload, eo.intentos, eo.creado_en
  )
  select m.id, m.organizacion_id, o.nombre, o.telefono_whatsapp, m.tipo, m.payload, m.intentos, m.creado_en
    from marcados m join organizaciones o on o.id = m.organizacion_id
   order by m.id;
end $$;

create or replace function finalizar_evento(p_id bigint, p_ok boolean, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_ok then
    update eventos_outbox set procesado_en = now(), error = null, bloqueado_hasta = null where id = p_id and procesado_en is null;
  else
    -- Se libera para el próximo intento (el contador ya subió al reclamarlo); a los 5 intentos queda muerto.
    update eventos_outbox set error = left(coalesce(p_error, 'error desconocido'), 500), bloqueado_hasta = now() + interval '1 minute'
     where id = p_id and procesado_en is null;
  end if;
end $$;

revoke all on function reclamar_eventos(integer) from public, anon, authenticated;
revoke all on function finalizar_evento(bigint, boolean, text) from public, anon, authenticated;
grant execute on function reclamar_eventos(integer) to service_role;
grant execute on function finalizar_evento(bigint, boolean, text) to service_role;
