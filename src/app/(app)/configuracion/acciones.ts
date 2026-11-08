"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zCelular } from "@/lib/validaciones/comunes";

export async function guardarWhatsApp(_prev: ResultadoAccion | null, f: FormData): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") return fallo("Solo el dueño o un administrador cambia este dato");
  const r = z.object({ telefono: zCelular }).safeParse({ telefono: String(f.get("telefono") ?? "") });
  if (!r.success) return fallo("Revisa el número", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("organizaciones").update({ telefono_whatsapp: r.data.telefono }).eq("id", ctx.organizacionId);
  if (error) return fallo("No pudimos guardar el número");
  revalidatePath("/configuracion");
  return ok(undefined);
}
