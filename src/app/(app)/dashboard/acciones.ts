"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, fallo, ok, zUuid } from "@/lib/validaciones/comunes";

export async function marcarAlertaLeida(alertaId: string): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") return fallo("No tienes permiso");
  const id = zUuid.safeParse(alertaId);
  if (!id.success) return fallo("Alerta inválida");
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("alertas")
    .update({ leida: true })
    .eq("id", id.data)
    .eq("organizacion_id", ctx.organizacionId);
  if (error) return fallo("No pudimos actualizar la alerta");
  revalidatePath("/dashboard");
  return ok(undefined);
}
