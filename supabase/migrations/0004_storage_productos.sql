-- 0004: bucket privado "productos" para fotos de productos.
-- Ruta de cada archivo: {organizacion_id}/{uuid}.{ext}  → la primera carpeta es el negocio.
-- Se protege con `if exists` porque el esquema `storage` solo existe en Supabase real
-- (no en la base de pruebas PGlite).

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage no disponible: se omite el bucket productos';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('productos', 'productos', false, 3145728, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;

  -- Leer: cualquier miembro activo del negocio dueño de la carpeta.
  execute $p$
    create policy productos_fotos_leer on storage.objects for select to authenticated
    using (
      bucket_id = 'productos'
      and (storage.foldername(name))[1]::uuid in (select public.mis_organizaciones())
    )
  $p$;

  -- Escribir: solo roles que editan productos.
  execute $p$
    create policy productos_fotos_subir on storage.objects for insert to authenticated
    with check (
      bucket_id = 'productos'
      and (storage.foldername(name))[1]::uuid in (select public.mis_organizaciones())
      and public.tiene_rol((storage.foldername(name))[1]::uuid, public.roles_escritura('productos'))
    )
  $p$;

  execute $p$
    create policy productos_fotos_borrar on storage.objects for delete to authenticated
    using (
      bucket_id = 'productos'
      and (storage.foldername(name))[1]::uuid in (select public.mis_organizaciones())
      and public.tiene_rol((storage.foldername(name))[1]::uuid, public.roles_escritura('productos'))
    )
  $p$;
end
$$;
