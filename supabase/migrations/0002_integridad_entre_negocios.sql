-- =====================================================================
-- 0002 — Integridad entre negocios
--
-- Hallazgo (test src/test/db/rls.db.test.ts): RLS filtra por fila, pero las llaves foráneas se validan
-- SIN RLS. Un usuario del negocio B podía crear, por ejemplo, una venta propia con el producto, el
-- cliente o la bodega de A (conociendo su UUID). Este trigger exige que toda referencia apunte a una
-- fila de la MISMA organización. Además exige que la presentación de una línea pertenezca al producto
-- de esa línea (si no, se aplicaría el factor de otro producto).
-- =====================================================================

create or replace function exigir_misma_organizacion() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  arg text; col text; tabla text; valor uuid; org uuid;
  fila jsonb := to_jsonb(new);
begin
  foreach arg in array tg_argv loop
    col := split_part(arg, ':', 1);
    tabla := split_part(arg, ':', 2);
    valor := nullif(fila ->> col, '')::uuid;
    if valor is null then continue; end if;
    execute format('select organizacion_id from %I where id = $1', tabla) into org using valor;
    if org is distinct from new.organizacion_id then
      raise exception 'Referencia inválida: % pertenece a otro negocio o no existe', col
        using errcode = '23503';
    end if;
  end loop;
  return new;
end $$;

create or replace function exigir_presentacion_del_producto() returns trigger
language plpgsql security definer set search_path = public as $$
declare prod uuid;
begin
  if new.presentacion_id is null then return new; end if;
  select producto_id into prod from presentaciones where id = new.presentacion_id;
  if prod is distinct from new.producto_id then
    raise exception 'La presentación no corresponde al producto de la línea' using errcode = '23503';
  end if;
  return new;
end $$;

do $$
declare
  def record;
begin
  for def in
    select * from (values
      ('productos',         'categoria_id:categorias'),
      ('categorias',        'padre_id:categorias'),
      ('presentaciones',    'producto_id:productos'),
      ('turnos_caja',       'bodega_id:bodegas'),
      ('compras',           'proveedor_id:proveedores,bodega_id:bodegas'),
      ('compras_detalle',   'compra_id:compras,producto_id:productos,presentacion_id:presentaciones'),
      ('precios_proveedor', 'proveedor_id:proveedores,producto_id:productos,compra_id:compras'),
      ('ventas',            'bodega_id:bodegas,cliente_id:clientes,turno_id:turnos_caja'),
      ('ventas_detalle',    'venta_id:ventas,producto_id:productos,presentacion_id:presentaciones'),
      ('pagos_venta',       'venta_id:ventas,comprobante_id:comprobantes'),
      ('abonos_cliente',    'cliente_id:clientes,turno_id:turnos_caja,comprobante_id:comprobantes')
    ) as t(tabla, refs)
  loop
    execute format(
      'create trigger trg_misma_org before insert or update on %I
         for each row execute function exigir_misma_organizacion(%s)',
      def.tabla,
      (select string_agg(quote_literal(r), ', ') from unnest(string_to_array(def.refs, ',')) as r)
    );
  end loop;
end $$;

create trigger trg_presentacion_del_producto before insert or update on compras_detalle
  for each row execute function exigir_presentacion_del_producto();
create trigger trg_presentacion_del_producto before insert or update on ventas_detalle
  for each row execute function exigir_presentacion_del_producto();
