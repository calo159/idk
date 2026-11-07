"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok } from "@/lib/validaciones/comunes";
import { esquemaAnularVenta } from "@/lib/validaciones/ventas";

/** Anula una venta confirmada: devuelve inventario y cartera con movimientos contrarios y deja auditoría. */
export async function anularVenta(ventaId: string, motivo: string): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "ventas.anular")) return fallo("Solo el dueño o un administrador anula ventas");
  const r = esquemaAnularVenta.safeParse({ venta_id: ventaId, motivo });
  if (!r.success) return fallo("Escribe el motivo de la anulación", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anular_venta", { p_venta_id: r.data.venta_id, p_motivo: r.data.motivo });
  if (error) {
    return fallo(
      /solo se anulan/i.test(error.message)
        ? "Esta venta ya estaba anulada"
        : "No pudimos anular la venta",
    );
  }
  revalidatePath("/ventas/historial");
  revalidatePath(`/ventas/${r.data.venta_id}`);
  revalidatePath("/inventario");
  revalidatePath("/caja");
  revalidatePath("/clientes");
  return ok(undefined);
}
