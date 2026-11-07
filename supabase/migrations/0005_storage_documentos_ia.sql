-- 0005: bucket privado "documentos-ia" (fotos de facturas, comprobantes, cuadernos).
-- Ruta: {organizacion_id}/{uuid}.{ext}. Solo roles que pueden crear documentos_ia.
-- Protegido con `if exists` porque `storage` no existe en la base de pruebas PGlite.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage no disponible: se omite el bucket documentos-ia';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('documentos-ia', 'documentos-ia', false, 8388608,
          array['image/jpeg','image/png','image/webp','application/pdf'])
  on conflict (id) do nothing;

  execute $p$
    create policy documentos_ia_leer on storage.objects for select to authenticated
    using (
      bucket_id = 'documentos-ia'
      and (storage.foldername(name))[1]::uuid in (select public.mis_organizaciones())
    )
  $p$;

  execute $p$
    create policy documentos_ia_subir on storage.objects for insert to authenticated
    with check (
      bucket_id = 'documentos-ia'
      and (storage.foldername(name))[1]::uuid in (select public.mis_organizaciones())
      and public.tiene_rol((storage.foldername(name))[1]::uuid, public.roles_escritura('documentos_ia'))
    )
  $p$;
end
$$;
