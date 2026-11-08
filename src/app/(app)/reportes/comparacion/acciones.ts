"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, fallo, ok } from "@/lib/validaciones/comunes";

export async function cambiarCompartir(compartir: boolean): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno") return fallo("Solo el dueño decide si comparte las cifras del negocio");
  const supabase = await crearClienteServidor();
  // Se guarda primero la foto de hoy para que el negocio cuente desde el primer día (si no hay datos suficientes, no entra al grupo).
  if (compartir) await supabase.rpc("metricas_salud", { p_org: ctx.organizacionId });
  const { error } = await supabase.rpc("configurar_benchmark", { p_org: ctx.organizacionId, p_compartir: compartir });
  if (error) return fallo("No pudimos guardar tu decisión. Intenta de nuevo.");
  revalidatePath("/reportes/comparacion");
  return ok(undefined);
}
