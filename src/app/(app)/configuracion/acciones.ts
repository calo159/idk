"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zCelular } from "@/lib/validaciones/comunes";

export async function guardarWhatsApp(_prev: ResultadoAccion | null, f: FormData): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") return fallo("Solo el dueño o un administrador cambia este dato");
  const r = z
    .object({ telefono: zCelular, numero_id: z.string().trim().regex(/^\d{5,30}$/, "Solo números (lo da Meta)").or(z.literal("")) })
    .safeParse({ telefono: String(f.get("telefono") ?? ""), numero_id: String(f.get("numero_id") ?? "") });
  if (!r.success) return fallo("Revisa el número", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("organizaciones").update({ telefono_whatsapp: r.data.telefono, whatsapp_phone_number_id: r.data.numero_id || null }).eq("id", ctx.organizacionId);
  if (error) return fallo(/unique|duplicate/i.test(error.message) ? "Ese ID de WhatsApp Business ya está en uso" : "No pudimos guardar el número");
  revalidatePath("/configuracion");
  return ok(undefined);
}
