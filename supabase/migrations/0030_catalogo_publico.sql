-- 0030: catálogo web público (Fase 3: 3.11).
--
--  * Cada negocio puede publicar su catálogo en /catalogo/<slug>. Es de SOLO LECTURA y sin sesión (rol anon).
--  * Solo sale lo estrictamente necesario: nombre, descripción, categoría, unidad, precio (con la promoción vigente) y si hay o no
--    (nunca cantidades exactas, costos, proveedores ni datos de clientes).
--  * Por defecto el catálogo está apagado. Al encenderlo se publican todos los productos activos con precio; el dueño puede ocultar los que quiera.
--  * Los pedidos NO se guardan aquí: el cliente arma su lista y la envía por WhatsApp al negocio (donde ya la recibe el flujo F6).
--    Así no hay un formulario público que alguien pueda usar para llenar la base de datos de basura.

alter table organizaciones
  add column if not exists catalogo_activo boolean not null default false,
  add column if not exists catalogo_slug text,
  add column if not exists catalogo_telefono text,
  add column if not exists catalogo_mensaje text;
alter table organizaciones add constraint organizaciones_catalogo_slug_formato
  check (catalogo_slug is null or (catalogo_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(catalogo_slug) between 3 and 40));
alter table organizaciones add constraint organizaciones_catalogo_mensaje_largo
  check (catalogo_mensaje is null or char_length(catalogo_mensaje) <= 200);
create unique index organizaciones_catalogo_slug_unico on organizaciones (catalogo_slug) where catalogo_slug is not null;

alter table productos add column if not exists en_catalogo boolean not null default true;

create or replace function configurar_catalogo(p_org uuid, p_activo boolean, p_slug text, p_telefono text, p_mensaje text)
returns void language plpgsql security definer set search_path = public as $$
declare slug text := nullif(lower(trim(coalesce(p_slug, ''))), '');
        tel text := nullif(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), '');
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin configuran el catálogo'; end if;
  if p_activo and slug is null then raise exception 'Elige la dirección de tu catálogo'; end if;
  if slug is not null and slug in ('api', 'admin', 'login', 'registro', 'www', 'app', 'surtix', 'catalogo', 'demo') then
    raise exception 'Esa dirección está reservada, elige otra';
  end if;
  if p_activo and (tel is null or char_length(tel) < 10) then raise exception 'Para recibir pedidos escribe el WhatsApp del negocio'; end if;
  begin
    update organizaciones set catalogo_activo = p_activo, catalogo_slug = slug, catalogo_telefono = tel,
           catalogo_mensaje = nullif(trim(coalesce(p_mensaje, '')), '') where id = p_org;
  exception when unique_violation then
    raise exception 'Esa dirección ya la usa otro negocio';
  when check_violation then
    raise exception 'La dirección solo puede tener letras minúsculas, números y guiones (de 3 a 40 caracteres)';
  end;
end $$;

-- Publicar u ocultar varios productos a la vez.
create or replace function publicar_en_catalogo(p_org uuid, p_ids uuid[], p_publicar boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not tiene_rol(p_org, array['dueno','admin']::rol_miembro[]) then raise exception 'Solo dueño o admin editan el catálogo'; end if;
  update productos set en_catalogo = p_publicar where organizacion_id = p_org and id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

-- Datos del negocio para la cabecera del catálogo (null si no existe o está apagado).
create or replace function catalogo_publico(p_slug text)
returns table (nombre text, telefono text, mensaje text)
language sql stable security definer set search_path = public as $$
  select o.nombre, coalesce(o.catalogo_telefono, regexp_replace(coalesce(o.telefono_whatsapp, ''), '\D', '', 'g')), o.catalogo_mensaje
    from organizaciones o where o.catalogo_activo and o.catalogo_slug = lower(p_slug);
$$;

create or replace function catalogo_productos(p_slug text)
returns table (id uuid, nombre text, descripcion text, categoria text, unidad text, precio numeric, precio_antes numeric, disponible boolean)
language sql stable security definer set search_path = public as $$
  with org as (select o.id from organizaciones o where o.catalogo_activo and o.catalogo_slug = lower(p_slug)),
  promo as (
    select pp.producto_id, min(pp.precio_promocional) as precio
      from promociones_productos pp join promociones pr on pr.id = pp.promocion_id
     where pr.organizacion_id = (select id from org) and pr.activa
       and (now() at time zone 'America/Bogota')::date between pr.desde and pr.hasta
     group by pp.producto_id
  )
  select p.id, p.nombre, p.descripcion, c.nombre, p.unidad_base,
         least(p.precio_venta, coalesce(pm.precio, p.precio_venta))::numeric(14,2),
         case when pm.precio is not null and pm.precio < p.precio_venta then p.precio_venta end,
         (not p.maneja_inventario) or coalesce((select sum(e.cantidad) from existencias e where e.producto_id = p.id), 0) > 0
    from productos p
    join org on org.id = p.organizacion_id
    left join categorias c on c.id = p.categoria_id
    left join promo pm on pm.producto_id = p.id
   where p.activo and p.en_catalogo and p.precio_venta > 0
   order by c.nombre nulls last, p.nombre
   limit 1500;
$$;

do $$
declare f text;
begin
  foreach f in array array['configurar_catalogo(uuid,boolean,text,text,text)', 'publicar_en_catalogo(uuid,uuid[],boolean)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['catalogo_publico(text)', 'catalogo_productos(text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
