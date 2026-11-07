-- 0011: gastos con soporte, retiros/ingresos de efectivo y control antirrobo (Fase 2: 2.7 y 2.8)
--
--  * gastos: se anulan, no se borran (regla #4). Un gasto en efectivo con turno descuenta del efectivo esperado.
--  * movimientos_caja: retiros e ingresos de efectivo del turno (siempre con motivo).
--  * cerrar_turno: el efectivo esperado ahora = base + ventas + abonos + ingresos − retiros − gastos en efectivo.
--  * riesgo por turno: señales objetivas con puntaje 0–100. Son señales para revisar, no acusaciones.
--  * alertas automáticas: anulación a los pocos minutos de cobrar, ajustes negativos repetidos, comprobantes
--    sospechosos y cierres con faltante.

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table gastos (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  turno_id uuid references turnos_caja(id),
  categoria text not null,
  descripcion text not null,
  monto numeric(14,2) not null check (monto > 0),
  metodo metodo_pago not null default 'efectivo' check (metodo <> 'credito'),
  soporte_url text,
  fecha date not null default (now() at time zone 'America/Bogota')::date,
  estado text not null default 'activo' check (estado in ('activo','anulado')),
  motivo_anulacion text,
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index on gastos (organizacion_id, fecha desc);

create table movimientos_caja (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  turno_id uuid not null references turnos_caja(id),
  tipo text not null check (tipo in ('retiro','ingreso')),
  monto numeric(14,2) not null check (monto > 0),
  motivo text not null check (length(trim(motivo)) >= 3),
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index on movimientos_caja (turno_id);

alter table gastos enable row level security;
alter table movimientos_caja enable row level security;
create policy gastos_leer on gastos for select using (organizacion_id in (select mis_organizaciones()));
create policy movimientos_caja_leer on movimientos_caja for select
  using (organizacion_id in (select mis_organizaciones()));
-- Sin políticas de escritura: solo se escribe con las funciones de abajo.

create trigger trg_misma_org before insert or update on gastos
  for each row execute function exigir_misma_organizacion('turno_id:turnos_caja');
create trigger trg_misma_org before insert or update on movimientos_caja
  for each row execute function exigir_misma_organizacion('turno_id:turnos_caja');

-- ---------------------------------------------------------------------
-- Alertas sin repetirse
-- ---------------------------------------------------------------------
create or replace function crear_alerta_unica(p_org uuid, p_tipo text, p_clave text, p_severidad text,
  p_mensaje text, p_datos jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from alertas where organizacion_id = p_org and tipo = p_tipo and not leida
             and datos->>'clave' = p_clave and creado_en > now() - interval '12 hours') then
    return;
  end if;
  insert into alertas (organizacion_id, tipo, severidad, mensaje, datos)
  values (p_org, p_tipo, p_severidad, p_mensaje, p_datos || jsonb_build_object('clave', p_clave));
end $$;
revoke all on function crear_alerta_unica(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Gastos
-- ---------------------------------------------------------------------
create or replace function registrar_gasto(p_org uuid, p_categoria text, p_descripcion text, p_monto numeric,
  p_metodo metodo_pago default 'efectivo', p_soporte text default null, p_fecha date default null,
  p_turno uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare t turnos_caja%rowtype; nuevo uuid; grande numeric;
begin
  if not tiene_rol(p_org, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then
    raise exception 'Sin permiso para registrar gastos';
  end if;
  if coalesce(trim(p_categoria),'') = '' or coalesce(trim(p_descripcion),'') = '' then
    raise exception 'La categoría y la descripción son obligatorias';
  end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  if p_metodo = 'credito' then raise exception 'Un gasto no puede ser a crédito'; end if;

  -- Un gasto en efectivo sale de la caja: debe ir en un turno abierto de quien lo registra.
  if p_metodo = 'efectivo' and p_turno is not null then
    select * into t from turnos_caja where id = p_turno and organizacion_id = p_org;
    if not found or t.estado <> 'abierto' then raise exception 'El turno no está abierto'; end if;
    if t.usuario_id <> auth.uid() and not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then
      raise exception 'Ese turno es de otra persona';
    end if;
  end if;

  insert into gastos (organizacion_id, turno_id, categoria, descripcion, monto, metodo, soporte_url, fecha, usuario_id)
  values (p_org, case when p_metodo = 'efectivo' then p_turno end, trim(p_categoria), trim(p_descripcion),
          p_monto, p_metodo, p_soporte, coalesce(p_fecha, (now() at time zone 'America/Bogota')::date), auth.uid())
  returning id into nuevo;

  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (p_org, 'gastos', nuevo::text, 'crear', jsonb_build_object('monto', p_monto, 'categoria', p_categoria), auth.uid());

  select umbral_ajuste_alerta into grande from organizaciones where id = p_org;
  if p_monto >= grande then
    perform crear_alerta_unica(p_org, 'gasto_grande', nuevo::text, 'media',
      'Gasto grande registrado: ' || trim(p_descripcion), jsonb_build_object('gasto_id', nuevo, 'monto', p_monto));
  end if;
  return nuevo;
end $$;

create or replace function anular_gasto(p_gasto uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare g gastos%rowtype;
begin
  if coalesce(trim(p_motivo),'') = '' then raise exception 'El motivo es obligatorio'; end if;
  select * into g from gastos where id = p_gasto for update;
  if not found then raise exception 'Gasto no existe'; end if;
  if not tiene_rol(g.organizacion_id, array['dueno','admin']::rol_miembro[]) then
    raise exception 'Solo dueño o admin anulan gastos';
  end if;
  if g.estado <> 'activo' then raise exception 'El gasto ya está anulado'; end if;
  update gastos set estado = 'anulado', motivo_anulacion = p_motivo where id = g.id;
  insert into auditoria (organizacion_id, tabla, registro_id, accion, antes, despues, usuario_id)
  values (g.organizacion_id, 'gastos', g.id::text, 'anular', jsonb_build_object('monto', g.monto),
          jsonb_build_object('motivo', p_motivo), auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- Retiros e ingresos de efectivo
-- ---------------------------------------------------------------------
create or replace function registrar_movimiento_caja(p_turno uuid, p_tipo text, p_monto numeric, p_motivo text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare t turnos_caja%rowtype; nuevo uuid; umbral numeric;
begin
  select * into t from turnos_caja where id = p_turno for update;
  if not found or t.organizacion_id not in (select mis_organizaciones()) then raise exception 'Turno no existe'; end if;
  if t.estado <> 'abierto' then raise exception 'El turno no está abierto'; end if;
  if not tiene_rol(t.organizacion_id, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then
    raise exception 'Sin permiso para mover efectivo';
  end if;
  if t.usuario_id <> auth.uid() and not tiene_rol(t.organizacion_id, array['dueno','admin']::rol_miembro[]) then
    raise exception 'Ese turno es de otra persona';
  end if;
  if p_tipo not in ('retiro','ingreso') then raise exception 'Tipo inválido'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a cero'; end if;
  if coalesce(length(trim(p_motivo)), 0) < 3 then raise exception 'El motivo es obligatorio'; end if;

  insert into movimientos_caja (organizacion_id, turno_id, tipo, monto, motivo, usuario_id)
  values (t.organizacion_id, t.id, p_tipo, p_monto, trim(p_motivo), auth.uid()) returning id into nuevo;

  insert into auditoria (organizacion_id, tabla, registro_id, accion, despues, usuario_id)
  values (t.organizacion_id, 'movimientos_caja', nuevo::text, p_tipo,
          jsonb_build_object('monto', p_monto, 'motivo', p_motivo), auth.uid());

  select umbral_ajuste_alerta into umbral from organizaciones where id = t.organizacion_id;
  if p_tipo = 'retiro' and p_monto >= umbral then
    perform crear_alerta_unica(t.organizacion_id, 'retiro_grande', nuevo::text, 'media',
      'Retiro de efectivo grande: ' || trim(p_motivo), jsonb_build_object('movimiento_id', nuevo, 'monto', p_monto));
  end if;
  return nuevo;
end $$;

-- ---------------------------------------------------------------------
-- Efectivo esperado (una sola fórmula, usada al cerrar y para mostrar al dueño)
-- ---------------------------------------------------------------------
create or replace function efectivo_esperado_turno(p_turno uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select t.base_inicial
    + coalesce((select sum(pv.monto) from pagos_venta pv join ventas v on v.id = pv.venta_id
                 where v.turno_id = t.id and v.estado = 'confirmado' and pv.metodo = 'efectivo'), 0)
    + coalesce((select sum(a.monto) from abonos_cliente a where a.turno_id = t.id and a.metodo = 'efectivo'), 0)
    + coalesce((select sum(m.monto) from movimientos_caja m where m.turno_id = t.id and m.tipo = 'ingreso'), 0)
    - coalesce((select sum(m.monto) from movimientos_caja m where m.turno_id = t.id and m.tipo = 'retiro'), 0)
    - coalesce((select sum(g.monto) from gastos g where g.turno_id = t.id and g.estado = 'activo' and g.metodo = 'efectivo'), 0)
  from turnos_caja t
  where t.id = p_turno and t.organizacion_id in (select mis_organizaciones())
$$;
revoke all on function efectivo_esperado_turno(uuid) from public, anon;
grant execute on function efectivo_esperado_turno(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Riesgo por turno: señales objetivas, no acusaciones
-- ---------------------------------------------------------------------
create or replace function calcular_riesgo_turno(p_turno uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t turnos_caja%rowtype; fin timestamptz; senales jsonb := '[]'::jsonb; puntaje int := 0;
        n int; peso int; diff numeric; horas numeric; ventas_n int;
begin
  select * into t from turnos_caja where id = p_turno;
  if not found then raise exception 'Turno no existe'; end if;
  fin := coalesce(t.cerrado_en, now());

  -- 1. Ventas anuladas a los 10 minutos o menos de cobrar
  select count(*) into n from ventas v
   where v.turno_id = t.id and v.estado = 'anulado' and v.anulada_en is not null
     and v.anulada_en - v.creado_en <= interval '10 minutes';
  if n > 0 then
    peso := least(n * 20, 40); puntaje := puntaje + peso;
    senales := senales || jsonb_build_object('codigo','anulacion_rapida','peso',peso,
      'texto', n || ' venta(s) anulada(s) a los pocos minutos de cobrar');
  end if;

  -- 2. Cambios de precio / descuentos
  select count(*) into n from auditoria a join ventas v on v.id::text = a.registro_id
   where a.accion = 'precio_modificado' and v.turno_id = t.id;
  select n + count(*) into n from ventas v where v.turno_id = t.id and v.estado = 'confirmado' and v.descuento > 0;
  if n >= 3 then
    peso := least(10 + n * 2, 25); puntaje := puntaje + peso;
    senales := senales || jsonb_build_object('codigo','descuentos','peso',peso,
      'texto', n || ' ventas con precio cambiado o descuento');
  end if;

  -- 2b. Descuentos repetidos al mismo cliente
  select coalesce(max(c), 0) into n from (
    select count(*) c from ventas v
     where v.turno_id = t.id and v.cliente_id is not null and v.estado = 'confirmado'
       and (v.descuento > 0 or exists (select 1 from auditoria a where a.registro_id = v.id::text and a.accion = 'precio_modificado'))
     group by v.cliente_id) x;
  if n >= 2 then
    puntaje := puntaje + 15;
    senales := senales || jsonb_build_object('codigo','descuento_repetido_cliente','peso',15,
      'texto', 'Descuentos repetidos al mismo cliente (' || n || ' veces)');
  end if;

  -- 3. Ajustes negativos de inventario hechos por esta persona durante el turno
  select count(*) into n from movimientos_inventario m
   where m.organizacion_id = t.organizacion_id and m.usuario_id = t.usuario_id and m.tipo = 'ajuste_salida'
     and m.creado_en between t.abierto_en and fin;
  if n >= 3 then
    puntaje := puntaje + 20;
    senales := senales || jsonb_build_object('codigo','ajustes_negativos','peso',20,
      'texto', n || ' ajustes negativos de inventario en el turno');
  end if;

  -- 4. Caja abierta mucho tiempo con pocas ventas
  select count(*) into ventas_n from ventas v where v.turno_id = t.id and v.estado = 'confirmado';
  horas := extract(epoch from fin - t.abierto_en) / 3600;
  if horas >= 6 and ventas_n < 5 then
    puntaje := puntaje + 15;
    senales := senales || jsonb_build_object('codigo','caja_ociosa','peso',15,
      'texto', 'Caja abierta ' || round(horas) || ' horas con solo ' || ventas_n || ' venta(s)');
  end if;

  -- 5. Comprobantes sospechosos
  select count(*) into n from pagos_venta pv join ventas v on v.id = pv.venta_id
   where v.turno_id = t.id and pv.verificacion = 'sospechoso';
  if n > 0 then
    peso := least(n * 25, 50); puntaje := puntaje + peso;
    senales := senales || jsonb_build_object('codigo','comprobantes_sospechosos','peso',peso,
      'texto', n || ' pago(s) con comprobante sospechoso');
  end if;

  -- 6. Faltante al cerrar, y reincidencia de la misma persona en 30 días
  if t.estado = 'cerrado' and coalesce(t.diferencia, 0) < 0 then
    diff := abs(t.diferencia);
    peso := least(10 + floor(diff / 5000)::int * 5, 40); puntaje := puntaje + peso;
    senales := senales || jsonb_build_object('codigo','faltante','peso',peso,
      'texto', 'Faltante de $ ' || to_char(diff, 'FM999G999G999') || ' al cerrar');
    select count(*) into n from turnos_caja o
     where o.organizacion_id = t.organizacion_id and o.usuario_id = t.usuario_id and o.estado = 'cerrado'
       and o.diferencia < 0 and o.id <> t.id and o.cerrado_en > fin - interval '30 days';
    if n >= 2 then
      puntaje := puntaje + 15;
      senales := senales || jsonb_build_object('codigo','faltantes_recurrentes','peso',15,
        'texto', 'Otros ' || n || ' cierres con faltante en los últimos 30 días');
    end if;
  end if;

  puntaje := least(puntaje, 100);
  return jsonb_build_object('turno_id', t.id, 'puntaje', puntaje,
    'nivel', case when puntaje >= 50 then 'alto' when puntaje >= 25 then 'medio' else 'bajo' end,
    'senales', senales,
    'nota', 'Son señales para revisar, no una acusación.');
end $$;
revoke all on function calcular_riesgo_turno(uuid) from public, anon, authenticated;

create or replace function riesgo_turno(p_turno uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare org uuid;
begin
  select organizacion_id into org from turnos_caja where id = p_turno;
  if org is null then raise exception 'Turno no existe'; end if;
  if not tiene_rol(org, array['dueno','admin','contador']::rol_miembro[]) then
    raise exception 'Sin permiso para ver el riesgo de turnos';
  end if;
  return calcular_riesgo_turno(p_turno);
end $$;
revoke all on function riesgo_turno(uuid) from public, anon;
grant execute on function riesgo_turno(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- cerrar_turno v2: usa la fórmula única y alerta si el riesgo es alto o hay faltante
-- ---------------------------------------------------------------------
create or replace function cerrar_turno(p_turno uuid, p_contado numeric, p_denominaciones jsonb)
returns numeric
language plpgsql security definer set search_path = public as $$
declare t turnos_caja%rowtype; esperado numeric(14,2); r jsonb; umbral numeric;
begin
  select * into t from turnos_caja where id = p_turno for update;
  if not found or t.estado <> 'abierto' then raise exception 'Turno no está abierto'; end if;
  if t.usuario_id <> auth.uid() and not tiene_rol(t.organizacion_id, array['dueno','admin']::rol_miembro[]) then
    raise exception 'Sin permiso para cerrar este turno';
  end if;
  if p_contado is null or p_contado < 0 then raise exception 'El efectivo contado no es válido'; end if;

  select efectivo_esperado_turno(t.id) into esperado;

  update turnos_caja set estado = 'cerrado', efectivo_esperado = esperado, efectivo_contado = p_contado,
         diferencia = p_contado - esperado, conteo_denominaciones = p_denominaciones, cerrado_en = now()
   where id = t.id;

  insert into eventos_outbox (organizacion_id, tipo, payload)
  values (t.organizacion_id, 'caja.cerrada', jsonb_build_object('turno_id', t.id,
          'esperado', esperado, 'contado', p_contado, 'diferencia', p_contado - esperado));

  select umbral_ajuste_alerta into umbral from organizaciones where id = t.organizacion_id;
  if p_contado - esperado < 0 and abs(p_contado - esperado) >= umbral / 10 then
    perform crear_alerta_unica(t.organizacion_id, 'faltante_caja', t.id::text, 'alta',
      'Faltante de caja de $ ' || to_char(abs(p_contado - esperado), 'FM999G999G999') || ' al cerrar el turno',
      jsonb_build_object('turno_id', t.id, 'diferencia', p_contado - esperado));
  end if;
  r := calcular_riesgo_turno(t.id);
  if (r->>'puntaje')::int >= 50 then
    perform crear_alerta_unica(t.organizacion_id, 'riesgo_turno', t.id::text, 'alta',
      'Turno con riesgo alto (' || (r->>'puntaje') || '/100): revisa las señales',
      jsonb_build_object('turno_id', t.id, 'puntaje', (r->>'puntaje')::int));
  end if;
  return p_contado - esperado;
end $$;

-- ---------------------------------------------------------------------
-- Alertas automáticas
-- ---------------------------------------------------------------------
create or replace function alerta_anulacion_rapida() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'anulado' and old.estado = 'confirmado' and new.anulada_en is not null
     and new.anulada_en - old.creado_en <= interval '10 minutes' then
    perform crear_alerta_unica(new.organizacion_id, 'anulacion_rapida', new.id::text, 'alta',
      'Venta #' || coalesce(new.numero::text, '?') || ' anulada a los pocos minutos de cobrar',
      jsonb_build_object('venta_id', new.id, 'total', new.total, 'motivo', new.motivo_anulacion));
  end if;
  return new;
end $$;
create trigger trg_alerta_anulacion_rapida after update of estado on ventas
  for each row execute function alerta_anulacion_rapida();

create or replace function alerta_ajustes_negativos() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.tipo = 'ajuste_salida' and new.usuario_id is not null then
    select count(*) into n from movimientos_inventario
     where organizacion_id = new.organizacion_id and usuario_id = new.usuario_id
       and tipo = 'ajuste_salida' and creado_en > now() - interval '24 hours';
    if n >= 3 then
      perform crear_alerta_unica(new.organizacion_id, 'ajustes_negativos',
        new.usuario_id::text || ':' || (now() at time zone 'America/Bogota')::date::text, 'media',
        'Varios ajustes negativos de inventario hechos por la misma persona hoy (' || n || ')',
        jsonb_build_object('usuario_id', new.usuario_id, 'cantidad_ajustes', n));
    end if;
  end if;
  return new;
end $$;
create trigger trg_alerta_ajustes_negativos after insert on movimientos_inventario
  for each row execute function alerta_ajustes_negativos();

-- Permisos de ejecución de las funciones públicas
do $$
declare f text;
begin
  foreach f in array array[
    'registrar_gasto(uuid,text,text,numeric,metodo_pago,text,date,uuid)',
    'anular_gasto(uuid,text)',
    'registrar_movimiento_caja(uuid,text,numeric,text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
