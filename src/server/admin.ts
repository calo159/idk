import "server-only";
import { notFound, redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/**
 * Entrada de todo el panel de super-admin. Quien no es del equipo ve un 404 (ni siquiera se confirma que el panel existe).
 * No usa `requerirContexto`: una persona del equipo puede no pertenecer a ningún negocio.
 * La barrera real está en la base de datos: cada función `admin_*` vuelve a verificar `es_super_admin()`.
 */
export async function requerirSuperAdmin() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?siguiente=%2Fadmin");
  const { data: esAdmin } = await supabase.rpc("es_super_admin");
  if (esAdmin !== true) notFound();
  return { supabase, usuarioId: data.user.id, correo: data.user.email ?? "" };
}
