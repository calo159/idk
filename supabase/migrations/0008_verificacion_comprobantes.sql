-- 0008: verificación de comprobantes Nequi/Daviplata más estricta.
--  * hash perceptual (dHash de 64 bits): detecta la misma captura recomprimida o reescalada.
--  * un mismo comprobante no puede respaldar pagos de dos ventas distintas.
--  * comprobantes con fecha de hace más de 2 días se marcan sospechosos (reutilización de capturas viejas).
--  * toda sospecha crea una alerta visible para el dueño (además del evento para n8n).
-- La migración 0001 no se toca: se reemplaza la función por una versión nueva.

alter table comprobantes add column if not exists hash_perceptual bit(64);
create index if not exists comprobantes_hash_perceptual_idx on comprobantes (organizacion_id, hash_perceptual);

drop function if exists verificar_comprobante(uuid, numeric);

create or replace function verificar_comprobante(p_comprobante uuid, p_monto_esperado numeric,
  p_pago uuid default null)
returns estado_verificacion
language plpgsql security definer set search_path = public as $$
declare c comprobantes%rowtype; razon text; detalle jsonb := '{}'::jsonb;
begin
  select * into c from comprobantes where id = p_comprobante;
  if not found then raise exception 'Comprobante no existe'; end if;
  if not (c.organizacion_id in (select mis_organizaciones())) then raise exception 'Sin acceso'; end if;

  -- 1. Repetido: misma imagen, misma referencia o imagen casi idéntica (distancia de Hamming ≤ 6)
  if exists (
    select 1 from comprobantes o
    where o.organizacion_id = c.organizacion_id and o.id <> c.id
      and ((c.hash_imagen is not null and o.hash_imagen = c.hash_imagen)
        or (c.referencia is not null and o.referencia = c.referencia)
        or (c.hash_perceptual is not null and o.hash_perceptual is not null
            and bit_count(c.hash_perceptual # o.hash_perceptual) <= 6))
  ) then
    razon := 'repetido';
  -- 2. Ya respalda un pago de otra venta
  elsif exists (
    select 1 from pagos_venta pv
    where pv.comprobante_id = c.id and (p_pago is null or pv.id <> p_pago)
  ) then
    razon := 'usado_en_otra_venta';
  -- 3. Monto distinto o ilegible
  elsif c.monto_leido is null or c.monto_leido <> p_monto_esperado then
    razon := 'monto_diferente';
    detalle := jsonb_build_object('leido', c.monto_leido, 'esperado', p_monto_esperado);
  -- 4. Fecha vieja (captura reutilizada)
  elsif c.fecha_leida is not null and c.fecha_leida < now() - interval '2 days' then
    razon := 'fecha_antigua';
    detalle := jsonb_build_object('fecha', c.fecha_leida);
  end if;

  if razon is not null then
    insert into eventos_outbox (organizacion_id, tipo, payload)
    values (c.organizacion_id, 'comprobante.sospechoso',
            jsonb_build_object('comprobante_id', c.id, 'razon', razon) || detalle);
    insert into alertas (organizacion_id, tipo, severidad, mensaje, datos)
    values (c.organizacion_id, 'comprobante_sospechoso', 'alta',
            case razon
              when 'repetido' then 'Comprobante repetido: ya se había usado antes'
              when 'usado_en_otra_venta' then 'Comprobante ya usado en otra venta'
              when 'monto_diferente' then 'El monto del comprobante no coincide con el cobrado'
              else 'El comprobante tiene una fecha antigua' end,
            jsonb_build_object('comprobante_id', c.id, 'razon', razon) || detalle);
    return 'sospechoso';
  end if;

  return 'verificado_ia';
end $$;

revoke all on function verificar_comprobante(uuid, numeric, uuid) from public, anon;
grant execute on function verificar_comprobante(uuid, numeric, uuid) to authenticated;
