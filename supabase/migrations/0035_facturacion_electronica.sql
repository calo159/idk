-- 0035: facturación electrónica DIAN vía proveedor externo (Fase 4: 4.3).
--
-- ALCANCE (importante): esto es el MARCO de integración, no un facturador certificado.
--   * Datos fiscales y numeración autorizada por negocio, IVA por producto, documento de factura armado desde la venta,
--     cola de envío con reintentos, estado por factura y alertas.
--   * El envío real a la DIAN lo hace un PROVEEDOR TECNOLÓGICO autorizado (Factus, Alegra, Siigo…). Aquí solo existe el proveedor
--     «simulado», que sirve para pruebas y NO tiene validez fiscal: no puede usarse en ambiente de producción.
--   * Falta antes de facturar de verdad: contrato con un proveedor, su adaptador (src/server/facturacion/proveedores/) y revisión de
--     un contador. Las notas crédito por anulación NO se emiten solas: se avisa con una alerta.
--   * Supuesto: los precios de venta YA INCLUYEN el IVA (lo normal en el comercio al detal); la base se calcula hacia atrás.

alter table productos add column if not exists iva_pct numeric(5,2) not null default 0 check (iva_pct in (0, 5, 19));
alter table clientes add column if not exists tipo_documento text not null default 'CC' check (tipo_documento in ('CC', 'NIT', 'CE', 'PA', 'TI'));

create table config_facturacion (
  organizacion_id uuid primary key references organizaciones(id) on delete cascade,
  activa boolean not null default false,
  ambiente text not null default 'pruebas' check (ambiente in ('pruebas', 'produccion')),
  proveedor text not null default 'simulado' check (proveedor ~ '^[a-z]{3,20}$'),
  nit text check (nit is null or nit ~ '^[0-9]{6,12}$'),
  dv text check (dv is null or dv ~ '^[0-9]$'),
  razon_social text check (razon_social is null or char_length(razon_social) between 2 and 160),
  prefijo text check (prefijo is null or prefijo ~ '^[A-Z]{1,4}$'),
  resolucion_numero text,
  resolucion_fecha date,
  rango_desde bigint check (rango_desde is null or rango_desde > 0),
  rango_hasta bigint,
  vigencia_hasta date,
  siguiente_numero bigint,
  -- Tope para vender a «consumidor final» sin identificar al cliente (5 UVT). VERIFICAR cada año: la UVT cambia.
  consumidor_final_hasta numeric(14,2) not null default 261870,
  actualizado_en timestamptz not null default now(),
  check (rango_hasta is null or rango_desde is null or rango_hasta >= rango_desde)
);
alter table config_facturacion enable row level security;
create policy config_fe_leer on config_facturacion for select
  using (tiene_rol(organizacion_id, array['dueno','admin','contador']::rol_miembro[]));

create table facturas_electronicas (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones(id) on delete cascade,
  venta_id uuid not null unique references ventas(id),
  numero bigint not null,
  prefijo text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviando', 'aceptada', 'rechazada', 'error')),
  ambiente text not null,
  proveedor text not null,
  documento jsonb not null,
  cufe text,
  pdf_url text,
  xml_url text,
  respuesta jsonb,
  error text,
  intentos integer not null default 0,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  aceptado_en timestamptz,
  unique (organizacion_id, prefijo, numero)
);
create index on facturas_electronicas (organizacion_id, creado_en desc);
create index on facturas_electronicas (estado) where estado in ('pendiente', 'error', 'enviando');
alter table facturas_electronicas enable row level security;
create policy facturas_fe_leer on facturas_electronicas for select
  using (tiene_rol(organizacion_id, array['dueno','admin','contador','vendedor','ruta']::rol_miembro[]));
create trigger facturas_misma_org before insert on facturas_electronicas
  for each row execute function exigir_misma_organizacion('venta_id:ventas');

create or replace function guardar_config_facturacion(p_org uuid, p_activa boolean, p_ambiente text, p_proveedor text, p_nit text, p_dv text,
  p_razon_social text, p_prefijo text, p_resolucion_numero text, p_resolucion_fecha date, p_rango_desde bigint, p_rango_hasta bigint,
  p_vigencia_hasta date, p_consumidor_final_hasta numeric) returns void
language plpgsql security definer set search_path = public as $$
declare actual config_facturacion;
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin configuran la facturación'; end if;
  if p_ambiente = 'produccion' and p_proveedor = 'simulado' then raise exception 'El proveedor simulado solo sirve en pruebas, no tiene validez fiscal'; end if;
  if p_activa and (coalesce(p_nit, '') = '' or coalesce(p_razon_social, '') = '' or coalesce(p_prefijo, '') = '' or p_rango_desde is null or p_rango_hasta is null or p_vigencia_hasta is null) then
    raise exception 'Para activar completa NIT, razón social, prefijo, rango y vigencia de la resolución';
  end if;
  select * into actual from config_facturacion where organizacion_id = p_org;
  insert into config_facturacion (organizacion_id, activa, ambiente, proveedor, nit, dv, razon_social, prefijo, resolucion_numero, resolucion_fecha,
                                  rango_desde, rango_hasta, vigencia_hasta, siguiente_numero, consumidor_final_hasta)
  values (p_org, p_activa, p_ambiente, p_proveedor, nullif(trim(p_nit), ''), nullif(trim(p_dv), ''), nullif(trim(p_razon_social), ''), nullif(upper(trim(p_prefijo)), ''),
          nullif(trim(p_resolucion_numero), ''), p_resolucion_fecha, p_rango_desde, p_rango_hasta, p_vigencia_hasta, p_rango_desde, coalesce(p_consumidor_final_hasta, 261870))
  on conflict (organizacion_id) do update set
    activa = excluded.activa, ambiente = excluded.ambiente, proveedor = excluded.proveedor, nit = excluded.nit, dv = excluded.dv,
    razon_social = excluded.razon_social, prefijo = excluded.prefijo, resolucion_numero = excluded.resolucion_numero,
    resolucion_fecha = excluded.resolucion_fecha, rango_desde = excluded.rango_desde, rango_hasta = excluded.rango_hasta,
    vigencia_hasta = excluded.vigencia_hasta, consumidor_final_hasta = excluded.consumidor_final_hasta, actualizado_en = now(),
    -- El contador de numeración nunca retrocede; si cambia el rango, arranca en el menor número válido.
    siguiente_numero = case
      when actual.siguiente_numero is null or excluded.rango_desde is distinct from actual.rango_desde or excluded.prefijo is distinct from actual.prefijo then excluded.rango_desde
      else actual.siguiente_numero end;
exception when check_violation then
  raise exception 'Revisa los datos fiscales (NIT solo números, prefijo de 1 a 4 letras, rango válido)';
end $$;

-- Arma el documento a partir de la venta. Fuente única de lo que se le manda al proveedor.
create or replace function construir_documento_factura(p_venta uuid, p_numero bigint) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v ventas; cfg config_facturacion; cli clientes; receptor jsonb; lineas jsonb := '[]'::jsonb;
        total_lineas numeric; resto_desc numeric; r record; n integer; i integer := 0;
        prorrata numeric; neto numeric; base numeric; iva numeric;
        t_base numeric := 0; t_iva numeric := 0; t_neto numeric := 0; por_tarifa jsonb := '{}'::jsonb; tarifa text; pagos jsonb;
begin
  select * into v from ventas where id = p_venta;
  select * into cfg from config_facturacion where organizacion_id = v.organizacion_id;
  select coalesce(sum(subtotal), 0), count(*) into total_lineas, n from ventas_detalle where venta_id = p_venta;
  if n = 0 or total_lineas <= 0 then raise exception 'La venta no tiene valor para facturar'; end if;

  if v.cliente_id is not null then select * into cli from clientes where id = v.cliente_id; end if;
  if cli.id is not null and coalesce(cli.documento, '') <> '' then
    receptor := jsonb_build_object('tipo_documento', cli.tipo_documento, 'documento', cli.documento, 'nombre', cli.nombre);
  elsif v.total <= cfg.consumidor_final_hasta then
    receptor := jsonb_build_object('tipo_documento', 'CONSUMIDOR_FINAL', 'documento', '222222222222', 'nombre', 'Consumidor final');
  else
    raise exception 'Esta venta supera el tope para consumidor final: asocia un cliente con documento de identidad';
  end if;

  resto_desc := v.descuento;
  for r in
    select d.id, d.cantidad, d.precio_unitario, d.descuento, d.subtotal, p.nombre, coalesce(p.sku, p.codigo_barras, left(p.id::text, 8)) as codigo,
           p.unidad_base, p.iva_pct, pr.nombre as presentacion
      from ventas_detalle d join productos p on p.id = d.producto_id left join presentaciones pr on pr.id = d.presentacion_id
     where d.venta_id = p_venta order by d.id
  loop
    i := i + 1;
    -- El descuento general se reparte proporcional al valor de cada línea; la última se lleva el sobrante de redondeo.
    prorrata := case when i = n then resto_desc else round(v.descuento * r.subtotal / total_lineas, 2) end;
    resto_desc := resto_desc - prorrata;
    neto := r.subtotal - prorrata;
    base := round(neto / (1 + r.iva_pct / 100), 2);
    iva := neto - base;
    t_base := t_base + base; t_iva := t_iva + iva; t_neto := t_neto + neto;
    tarifa := trim(trailing '.' from trim(trailing '0' from r.iva_pct::text));
    tarifa := case when tarifa = '' then '0' else tarifa end;
    por_tarifa := jsonb_set(por_tarifa, array[tarifa], jsonb_build_object(
      'base', coalesce((por_tarifa -> tarifa ->> 'base')::numeric, 0) + base, 'iva', coalesce((por_tarifa -> tarifa ->> 'iva')::numeric, 0) + iva));
    lineas := lineas || jsonb_build_object('codigo', r.codigo, 'descripcion', r.nombre || coalesce(' · ' || r.presentacion, ''), 'unidad', coalesce(r.presentacion, r.unidad_base),
      'cantidad', r.cantidad, 'precio_unitario', r.precio_unitario, 'descuento_linea', r.descuento, 'descuento_general', prorrata,
      'base', base, 'iva_pct', r.iva_pct, 'iva', iva, 'total', neto);
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object('metodo', metodo, 'monto', monto)), '[]'::jsonb) into pagos from pagos_venta where venta_id = p_venta;
  return jsonb_build_object(
    'tipo', 'factura_venta', 'ambiente', cfg.ambiente, 'venta_id', v.id,
    'emisor', jsonb_build_object('nit', cfg.nit, 'dv', cfg.dv, 'razon_social', cfg.razon_social, 'prefijo', cfg.prefijo,
                                 'resolucion', cfg.resolucion_numero, 'resolucion_fecha', cfg.resolucion_fecha, 'rango_desde', cfg.rango_desde, 'rango_hasta', cfg.rango_hasta),
    'numero', p_numero, 'numero_completo', cfg.prefijo || p_numero,
    'fecha', to_char(v.creado_en at time zone 'America/Bogota', 'YYYY-MM-DD"T"HH24:MI:SS') || '-05:00',
    'receptor', receptor, 'lineas', lineas,
    'totales', jsonb_build_object('base', t_base, 'iva', t_iva, 'descuento_general', v.descuento, 'total', t_neto, 'por_tarifa', por_tarifa),
    'forma_pago', case when exists (select 1 from pagos_venta where venta_id = p_venta and metodo = 'credito') then 'credito' else 'contado' end,
    'pagos', pagos);
end $$;

create or replace function solicitar_factura_electronica(p_venta uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v ventas; cfg config_facturacion; existente uuid; num bigint; doc jsonb; nueva uuid;
begin
  select * into v from ventas where id = p_venta;
  if v.id is null then raise exception 'Venta no existe'; end if;
  if not tiene_rol(v.organizacion_id, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then raise exception 'Sin permiso para facturar'; end if;
  select id into existente from facturas_electronicas where venta_id = p_venta;
  if existente is not null then return existente; end if;     -- una venta, una factura: pedirla de nuevo no gasta otro número
  if v.estado <> 'confirmado' then raise exception 'Solo se factura una venta confirmada'; end if;
  select * into cfg from config_facturacion where organizacion_id = v.organizacion_id for update;
  if cfg.organizacion_id is null or not cfg.activa then raise exception 'La facturación electrónica no está activa'; end if;
  if cfg.vigencia_hasta < (now() at time zone 'America/Bogota')::date then raise exception 'La resolución de facturación está vencida'; end if;
  num := cfg.siguiente_numero;
  if num > cfg.rango_hasta then raise exception 'Se agotó la numeración autorizada: solicita una nueva resolución a la DIAN'; end if;
  doc := construir_documento_factura(p_venta, num);
  insert into facturas_electronicas (organizacion_id, venta_id, numero, prefijo, ambiente, proveedor, documento, creado_por)
  values (v.organizacion_id, p_venta, num, cfg.prefijo, cfg.ambiente, cfg.proveedor, doc, auth.uid()) returning id into nueva;
  update config_facturacion set siguiente_numero = num + 1 where organizacion_id = v.organizacion_id;
  return nueva;
end $$;

-- Reintento de una factura rechazada o con error: se rearma con los datos actuales (p. ej. se corrigió el documento del cliente) y CONSERVA el mismo número.
create or replace function reintentar_factura_electronica(p_factura uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f facturas_electronicas;
begin
  select * into f from facturas_electronicas where id = p_factura for update;
  if f.id is null then raise exception 'Factura no existe'; end if;
  if not tiene_rol(f.organizacion_id, array['dueno','admin','vendedor','ruta']::rol_miembro[]) then raise exception 'Sin permiso para facturar'; end if;
  if f.estado not in ('rechazada', 'error') then raise exception 'Solo se reintenta una factura rechazada o con error'; end if;
  update facturas_electronicas set estado = 'pendiente', intentos = 0, error = null, documento = construir_documento_factura(f.venta_id, f.numero) where id = f.id;
end $$;

-- Para el procesador de envío (service_role).
create or replace function facturas_pendientes_envio(p_limite integer default 20)
returns table (id uuid, organizacion_id uuid, proveedor text, ambiente text, documento jsonb, intentos integer)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with tomadas as (
    select f.id from facturas_electronicas f
     where (f.estado in ('pendiente', 'error') and f.intentos < 5)
        or (f.estado = 'enviando' and f.enviado_en < now() - interval '10 minutes')   -- el envío se quedó a medias
     order by f.creado_en limit least(greatest(p_limite, 1), 100) for update skip locked)
  update facturas_electronicas f set estado = 'enviando', enviado_en = now(), intentos = f.intentos + 1
    from tomadas t where f.id = t.id
  returning f.id, f.organizacion_id, f.proveedor, f.ambiente, f.documento, f.intentos;
end $$;

create or replace function resultado_factura_electronica(p_id uuid, p_estado text, p_cufe text, p_pdf text, p_xml text, p_respuesta jsonb, p_error text) returns text
language plpgsql security definer set search_path = public as $$
declare f facturas_electronicas;
begin
  select * into f from facturas_electronicas where id = p_id for update;
  if f.id is null then return 'desconocida'; end if;
  if f.estado = 'aceptada' then return 'ya_aceptada'; end if;   -- una factura aceptada jamás se modifica
  if p_estado = 'aceptada' then
    if coalesce(p_cufe, '') = '' then raise exception 'Una factura aceptada debe traer su CUFE'; end if;
    update facturas_electronicas set estado = 'aceptada', cufe = p_cufe, pdf_url = p_pdf, xml_url = p_xml, respuesta = p_respuesta, error = null, aceptado_en = now() where id = p_id;
    return 'aceptada';
  elsif p_estado = 'rechazada' then
    update facturas_electronicas set estado = 'rechazada', respuesta = p_respuesta, error = left(p_error, 500) where id = p_id;
    perform crear_alerta_unica(f.organizacion_id, 'factura_rechazada', f.id::text, 'alta',
      format('La DIAN/proveedor rechazó la factura %s%s: %s', f.prefijo, f.numero, coalesce(left(p_error, 200), 'sin detalle')), jsonb_build_object('factura_id', f.id, 'venta_id', f.venta_id));
    return 'rechazada';
  else
    update facturas_electronicas set estado = 'error', respuesta = p_respuesta, error = left(p_error, 500) where id = p_id;
    if f.intentos >= 5 then
      perform crear_alerta_unica(f.organizacion_id, 'factura_error', f.id::text, 'alta',
        format('No pudimos enviar la factura %s%s después de 5 intentos. Revísala en la venta.', f.prefijo, f.numero), jsonb_build_object('factura_id', f.id, 'venta_id', f.venta_id));
    end if;
    return 'error';
  end if;
end $$;

-- Anular una venta ya facturada exige una nota crédito electrónica. Aún no se emite sola: se avisa.
create or replace function avisar_nota_credito() returns trigger
language plpgsql security definer set search_path = public as $$
declare f facturas_electronicas;
begin
  select * into f from facturas_electronicas where venta_id = new.id and estado = 'aceptada';
  if f.id is not null then
    perform crear_alerta_unica(new.organizacion_id, 'factura_requiere_nota_credito', f.id::text, 'alta',
      format('Anulaste la venta #%s, que ya tenía la factura electrónica %s%s. Debes emitir la nota crédito con tu proveedor.', new.numero, f.prefijo, f.numero),
      jsonb_build_object('factura_id', f.id, 'venta_id', new.id));
  end if;
  return new;
end $$;
create trigger ventas_nota_credito after update of estado on ventas
  for each row when (new.estado = 'anulado' and old.estado is distinct from 'anulado') execute function avisar_nota_credito();

do $$
declare f text;
begin
  foreach f in array array['construir_documento_factura(uuid,bigint)', 'avisar_nota_credito()', 'facturas_pendientes_envio(integer)', 'resultado_factura_electronica(uuid,text,text,text,text,jsonb,text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  grant execute on function facturas_pendientes_envio(integer) to service_role;
  grant execute on function resultado_factura_electronica(uuid, text, text, text, text, jsonb, text) to service_role;
  foreach f in array array['guardar_config_facturacion(uuid,boolean,text,text,text,text,text,text,text,date,bigint,bigint,date,numeric)',
                           'solicitar_factura_electronica(uuid)', 'reintentar_factura_electronica(uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
