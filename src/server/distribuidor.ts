import "server-only";
import { notFound, redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/**
 * Entrada del portal del distribuidor. Quien no pertenece a un distribuidor ve un 404.
 * La barrera real está en la base de datos: cada función verifica `es_de_distribuidor()` y las tablas tienen RLS.
 */
export async function requerirDistribuidor() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?siguiente=%2Fdistribuidor");
  const { data: mios } = await supabase.rpc("mis_distribuidores");
  const distribuidor = mios?.[0];
  if (!distribuidor) notFound();
  return { supabase, distribuidor, correo: data.user.email ?? "" };
}
