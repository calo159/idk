"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { paraBd } from "@/lib/dinero";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zMonto, zUuid } from "@/lib/validaciones/comunes";

const admin = (rol: string) => rol === "dueno" || rol === "admin";
const esquema = z.object({ items: z.array(z.object({ producto_id: zUuid, precio: zMonto.refine((v) => v > 0, "El precio debe ser mayor a cero") })).min(1, "Elige al menos un producto").max(500) });

export async function aplicarPreciosElegidos(entrada: unknown, motivo = "Ajuste por margen objetivo"): Promise<ResultadoAccion<{ cambiados: number }>> {
  const ctx = await requerirContexto();
  if (!admin(ctx.rol)) return fallo("Solo el dueño o un administrador cambia precios");
  const r = esquema.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("aplicar_precios", {
    p_org: ctx.organizacionId,
    p_items: r.data.items.map((i) => ({ producto_id: i.producto_id, precio: paraBd(i.precio) })),
    p_motivo: motivo.slice(0, 120),
  });
  if (error) return fallo(/demasiado grande/.test(error.message) ? "Hay un cambio de precio demasiado grande (más de 5 veces). Revísalo." : "No pudimos cambiar los precios");
  revalidatePath("/productos");
  revalidatePath("/productos/precios");
  return ok({ cambiados: Number(data) });
}

export async function configurarAutomatico(activo: boolean): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!admin(ctx.rol)) return fallo("Solo el dueño o un administrador");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("configurar_precios_automaticos", { p_org: ctx.organizacionId, p_activo: activo });
  if (error) return fallo("No pudimos cambiar la configuración");
  revalidatePath("/productos/precios");
  return ok(undefined);
}
