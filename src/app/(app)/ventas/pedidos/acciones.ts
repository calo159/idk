"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, fallo, ok, zMotivo, zUuid } from "@/lib/validaciones/comunes";

export async function rechazarPedido(pedidoId: string, motivo: string): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "ventas.confirmar")) return fallo("No tienes permiso");
  const id = zUuid.safeParse(pedidoId);
  const m = zMotivo.safeParse(motivo);
  if (!id.success || !m.success) return fallo("Escribe el motivo (mínimo 3 letras)");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("resolver_pedido_whatsapp", { p_pedido: id.data, p_estado: "rechazado", p_motivo: m.data });
  if (error) return fallo(/ya fue/.test(error.message) ? "Este pedido ya fue atendido." : "No pudimos rechazar el pedido");
  revalidatePath("/ventas/pedidos");
  return ok(undefined);
}
