"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, fallo, ok, zUuid } from "@/lib/validaciones/comunes";

const esquema = z.object({
  usuarioId: zUuid,
  dia: z.number().int().min(1).max(7),
  clientes: z.array(zUuid).max(200, "Una ruta diaria admite máximo 200 clientes"),
});

export async function guardarRuta(entrada: unknown): Promise<ResultadoAccion<{ guardados: number }>> {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") return fallo("Solo el dueño o un administrador arma las rutas");
  const r = esquema.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("guardar_ruta", { p_org: ctx.organizacionId, p_usuario: r.data.usuarioId, p_dia: r.data.dia, p_clientes: r.data.clientes });
  if (error) return fallo(/repetidos|no existe|inactivo|parte del negocio|máximo/.test(error.message) ? error.message : "No pudimos guardar la ruta");
  revalidatePath("/configuracion/rutas");
  revalidatePath("/ventas/ruta");
  return ok({ guardados: data ?? 0 });
}
