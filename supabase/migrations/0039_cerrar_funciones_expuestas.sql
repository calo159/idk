-- 0039: cierra las funciones que la API de Supabase expone de más.
--
-- Hallazgo del asesor de seguridad de Supabase (get_advisors) sobre el proyecto real:
--   * 27 funciones SECURITY DEFINER podían llamarse SIN iniciar sesión (rol `anon`), por /rest/v1/rpc/<nombre>.
--     Algunas ni siquiera verifican quién llama (siguiente_consecutivo, aplicar_plantilla_nicho): cualquiera podía
--     mover la numeración de un negocio o llenarlo de categorías si adivinaba su identificador.
--   * Las funciones de trigger y los ayudantes internos tampoco deben ser llamables como RPC por nadie.
--   * 14 funciones no fijaban su `search_path`.
--
-- Postgres da EXECUTE a PUBLIC por defecto y Supabase además lo da a `anon` y `authenticated` con privilegios por defecto.
-- Aquí se invierte la regla: nada es ejecutable por anon ni PUBLIC salvo el catálogo público.

-- 1. anon y PUBLIC: nada, salvo las dos funciones del catálogo público.
revoke execute on all functions in schema public from public, anon;
grant execute on function catalogo_publico(text), catalogo_productos(text) to anon;

-- 2. Funciones de trigger: solo las dispara la base de datos, nadie las llama.
--    (Un trigger no necesita que el usuario tenga EXECUTE sobre su función.)
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;

-- 3. Ayudantes internos que solo usan otras funciones SECURITY DEFINER (corren como dueño y no necesitan el permiso del usuario).
revoke execute on function siguiente_consecutivo(uuid, text) from public, anon, authenticated;
revoke execute on function aplicar_plantilla_nicho(uuid, text) from public, anon, authenticated;

-- 4. search_path fijo en las funciones que no lo tenían.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f'
              and p.proname in ('proteger_detalle', 'proteger_saldo_cliente', 'desde_funcion', 'proteger_documento', 'proteger_verificacion',
                                'roles_escritura', 'signo_movimiento', 'bloquear_cambios', 'redondeo_precio', 'dia_en_temporada',
                                'estado_de_suscripcion', 'generar_codigo_referido', 'asignar_codigo_referido', 'razones_de_metricas')
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') loop
    execute format('alter function %s set search_path = public', f.firma);
  end loop;
end $$;
