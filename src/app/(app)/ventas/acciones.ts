"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok } from "@/lib/validaciones/comunes";
import { esquemaAnularVenta } from "@/lib/validaciones/ventas";
import { esquemaDevolucionCliente } from "@/lib/validaciones/ventas-extra";
import { cantidadParaBd } from "@/lib/dinero";

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

/** Devolución de un cliente: la mercancía vuelve al inventario y el dinero se reembolsa según elija. */
export async function devolverVenta(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "ventas.confirmar")) return fallo("No tienes permiso para recibir devoluciones");
  const r = esquemaDevolucionCliente.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("organizacion_id", ctx.organizacionId)
    .eq("usuario_id", ctx.usuarioId)
    .eq("estado", "abierto")
    .maybeSingle();
  const { data, error } = await supabase.rpc("registrar_devolucion_cliente", {
    p_venta: r.data.venta_id,
    p_lineas: r.data.lineas.map((l) => ({ venta_detalle_id: l.venta_detalle_id, cantidad: cantidadParaBd(l.cantidad) })),
    p_motivo: r.data.motivo,
    p_reembolso: r.data.reembolso,
    p_turno: turno?.id,
  });
  if (error || !data) {
    const m = error?.message ?? "";
    return fallo(
      /turno de caja abierto/.test(m) ? "Para devolver efectivo abre tu caja primero."
        : /más de lo vendido/.test(m) ? "No puedes devolver más de lo que se vendió."
        : /no tiene deuda/.test(m) ? "El cliente no tiene deuda para abonar."
        : "No pudimos registrar la devolución",
    );
  }
  revalidatePath(`/ventas/${r.data.venta_id}`);
  revalidatePath("/inventario");
  revalidatePath("/caja");
  revalidatePath("/ventas/historial");
  return ok({ id: data });
}
