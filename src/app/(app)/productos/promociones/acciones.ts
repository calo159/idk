"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { paraBd } from "@/lib/dinero";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zDia, zMonto, zTexto, zUuid } from "@/lib/validaciones/comunes";

const admin = (rol: string) => rol === "dueno" || rol === "admin";
const esquema = z.object({
  nombre: zTexto(3, 60, "El nombre"),
  desde: zDia,
  hasta: zDia,
  items: z.array(z.object({ producto_id: zUuid, precio: zMonto.refine((v) => v > 0, "Precio inválido") })).min(1, "Elige al menos un producto").max(200),
});

export async function crearPromocion(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  const ctx = await requerirContexto();
  if (!admin(ctx.rol)) return fallo("Solo el dueño o un administrador crea promociones");
  const r = esquema.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("crear_promocion", {
    p_org: ctx.organizacionId, p_nombre: r.data.nombre, p_desde: r.data.desde, p_hasta: r.data.hasta,
    p_items: r.data.items.map((i) => ({ producto_id: i.producto_id, precio: paraBd(i.precio) })),
  });
  if (error || !data) {
    const m = error?.message ?? "";
    return fallo(
      /por debajo de su costo/.test(m) ? "Una promoción dejaría un producto por debajo de su costo."
        : /menor al precio normal/.test(m) ? "El precio promocional debe ser menor al precio normal."
        : /120 días/.test(m) ? "Una promoción dura máximo 120 días."
        : /fecha final/.test(m) ? "La fecha final no puede ser anterior a la inicial."
        : "No pudimos crear la promoción",
    );
  }
  revalidatePath("/productos/promociones");
  revalidatePath("/ventas/pos");
  return ok({ id: data });
}

export async function terminarPromocion(id: string): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!admin(ctx.rol)) return fallo("Sin permiso");
  const u = zUuid.safeParse(id);
  if (!u.success) return fallo("Promoción inválida");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("desactivar_promocion", { p_id: u.data });
  if (error) return fallo("No pudimos terminar la promoción");
  revalidatePath("/productos/promociones");
  revalidatePath("/ventas/pos");
  return ok(undefined);
}
