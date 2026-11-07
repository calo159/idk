"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { cantidadParaBd, paraBd } from "@/lib/dinero";
import { diferenciaConteo } from "@/lib/inventario";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok } from "@/lib/validaciones/comunes";
import { esquemaAjuste } from "@/lib/validaciones/inventario";

const numericoBd = (v: string) => v as unknown as number;

/** Ajuste manual: entrada, salida o conteo físico. Siempre pasa por ajustar_inventario (movimiento + auditoría). */
export async function ajustarInventario(
  _prev: ResultadoAccion<{ diferencia: string }> | null,
  f: FormData,
): Promise<ResultadoAccion<{ diferencia: string }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "inventario.ajustar")) return fallo("No tienes permiso para ajustar inventario");

  const r = esquemaAjuste.safeParse(
    Object.fromEntries(
      ["producto_id", "bodega_id", "modo", "cantidad", "motivo", "costo"].map((c) => [
        c,
        String(f.get(c) ?? ""),
      ]),
    ),
  );
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));
  const d = r.data;
  const supabase = await crearClienteServidor();

  let delta: string;
  if (d.modo === "conteo") {
    const { data: ex } = await supabase
      .from("existencias")
      .select("cantidad")
      .eq("producto_id", d.producto_id)
      .eq("bodega_id", d.bodega_id)
      .maybeSingle();
    delta = diferenciaConteo(d.cantidad, ex?.cantidad ?? 0).toFixed(3);
  } else {
    delta = cantidadParaBd(d.modo === "salida" ? -d.cantidad : d.cantidad);
  }
  if (Number(delta) === 0) return ok({ diferencia: "0.000" });

  const { error } = await supabase.rpc("ajustar_inventario", {
    p_org: ctx.organizacionId,
    p_producto: d.producto_id,
    p_bodega: d.bodega_id,
    p_cantidad: numericoBd(delta),
    p_motivo: d.modo === "conteo" ? `Conteo físico: ${d.motivo}` : d.motivo,
    p_costo: numericoBd(paraBd(d.costo)),
  });
  if (error) {
    return fallo(
      /negativ|insuficiente/i.test(error.message)
        ? "No hay suficiente stock para esa salida"
        : "No pudimos registrar el ajuste",
    );
  }
  revalidatePath("/inventario");
  revalidatePath(`/inventario/${d.producto_id}`);
  return ok({ diferencia: delta });
}
