"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { zCodigoReferido } from "@/lib/validaciones/auth";
import { type ResultadoAccion, fallo, ok } from "@/lib/validaciones/comunes";

/** Lo que la base de datos responde, dicho en cristiano. */
const MENSAJE_REFERIDO: Record<string, string> = {
  ya_usado: "Ya usaste un código de referido.",
  vencido: "Pasaron más de 30 días desde que creaste tu negocio, ya no se puede usar un código.",
  ya_pago: "Ya pagaste tu suscripción, ya no se puede usar un código.",
  codigo_invalido: "Ese código no existe. Revísalo con quien te lo dio.",
  no_permitido: "No puedes usar ese código (es de un negocio tuyo o relacionado contigo).",
};

export async function usarCodigoReferido(entrada: unknown): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno") return fallo("Solo el dueño puede usar un código de referido");
  const r = z.object({ codigo: zCodigoReferido }).safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Código inválido");
  if (!r.data.codigo) return fallo("Escribe el código");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("aplicar_codigo_referido", { p_org: ctx.organizacionId, p_codigo: r.data.codigo });
  if (error) return fallo("No pudimos aplicar el código. Intenta de nuevo.");
  if (data !== "ok") return fallo(MENSAJE_REFERIDO[data ?? ""] ?? "No pudimos aplicar el código.");
  revalidatePath("/referidos");
  return ok(undefined);
}
