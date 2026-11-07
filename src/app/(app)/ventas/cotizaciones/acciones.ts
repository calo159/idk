"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { cantidadParaBd, paraBd } from "@/lib/dinero";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zUuid } from "@/lib/validaciones/comunes";
import { esquemaCotizacion } from "@/lib/validaciones/ventas-extra";

export async function crearCotizacion(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "ventas.confirmar")) return fallo("No tienes permiso para cotizar");
  const r = esquemaCotizacion.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("crear_cotizacion", {
    p_org: ctx.organizacionId,
    // El cliente es opcional: SQL acepta null aunque los tipos generados no lo marcan.
    p_cliente: r.data.cliente_id as unknown as string,
    p_lineas: r.data.lineas.map((l) => ({
      producto_id: l.producto_id,
      presentacion_id: l.presentacion_id,
      cantidad: cantidadParaBd(l.cantidad),
      precio: paraBd(l.precio),
      descuento: paraBd(l.descuento),
    })),
    p_vigencia: r.data.vigencia_hasta,
    p_nota: r.data.nota,
  });
  if (error || !data) return fallo("No pudimos crear la cotización");
  revalidatePath("/ventas/cotizaciones");
  return ok({ id: data });
}

export async function cancelarCotizacion(id: string): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "ventas.confirmar")) return fallo("No tienes permiso");
  const u = zUuid.safeParse(id);
  if (!u.success) return fallo("Cotización inválida");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cambiar_estado_cotizacion", { p_cot: u.data, p_estado: "cancelada" });
  if (error) return fallo("No pudimos cancelar la cotización");
  revalidatePath("/ventas/cotizaciones");
  return ok(undefined);
}
