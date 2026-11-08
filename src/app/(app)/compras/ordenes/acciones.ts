"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { cantidadParaBd, paraBd } from "@/lib/dinero";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zUuid } from "@/lib/validaciones/comunes";
import {
  esquemaDevolucionProveedor,
  esquemaOrdenCompra,
  esquemaPagoProveedor,
  esquemaRecibo,
} from "@/lib/validaciones/ordenes";

const numericoBd = (v: string) => v as unknown as number;
const permiso = "compras.confirmar";

export async function crearOrden(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, permiso)) return fallo("No tienes permiso para crear órdenes de compra");
  const r = esquemaOrdenCompra.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("crear_orden_compra", {
    p_org: ctx.organizacionId,
    p_proveedor: r.data.proveedor_id,
    p_bodega: r.data.bodega_id,
    p_lineas: r.data.lineas.map((l) => ({
      producto_id: l.producto_id,
      presentacion_id: l.presentacion_id,
      cantidad: cantidadParaBd(l.cantidad),
      costo: paraBd(l.costo),
    })),
    p_fecha_esperada: r.data.fecha_esperada,
    p_nota: r.data.nota,
  });
  if (error || !data) return fallo("No pudimos crear la orden");
  revalidatePath("/compras/ordenes");
  return ok({ id: data });
}

export async function cambiarEstadoOrden(ordenId: string, estado: "enviada" | "cancelada"): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, permiso)) return fallo("No tienes permiso");
  const id = zUuid.safeParse(ordenId);
  if (!id.success) return fallo("Orden inválida");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cambiar_estado_orden", { p_orden: id.data, p_estado: estado });
  if (error) return fallo("No pudimos cambiar el estado de la orden");
  revalidatePath(`/compras/ordenes/${id.data}`);
  revalidatePath("/compras/ordenes");
  return ok(undefined);
}

export async function recibirOrden(entrada: unknown): Promise<ResultadoAccion<{ compraId: string }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, permiso)) return fallo("No tienes permiso para recibir mercancía");
  const r = esquemaRecibo.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("recibir_orden_compra", {
    p_orden: r.data.orden_id,
    p_lineas: r.data.lineas
      .filter((l) => l.cantidad > 0)
      .map((l) => ({ detalle_id: l.detalle_id, cantidad: cantidadParaBd(l.cantidad), ...(l.costo !== undefined ? { costo: paraBd(l.costo) } : {}) })),
    p_factura: r.data.factura,
    p_condicion: r.data.condicion,
    p_dias_credito: r.data.dias_credito,
  });
  if (error || !data)
    return fallo(/más de lo pedido/.test(error?.message ?? "") ? "No puedes recibir más de lo pedido (máximo 10 % de tolerancia)" : "No pudimos registrar la recepción");
  await supabase.rpc("actualizar_precios_automaticos", { p_org: ctx.organizacionId }).then(() => undefined, () => undefined);
  revalidatePath(`/compras/ordenes/${r.data.orden_id}`);
  revalidatePath("/compras");
  revalidatePath("/inventario");
  revalidatePath("/compras/pagos");
  return ok({ compraId: data });
}

export async function pagarProveedor(entrada: unknown): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") return fallo("Solo el dueño o un administrador paga a proveedores");
  const r = esquemaPagoProveedor.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("registrar_pago_proveedor", {
    p_cxp: r.data.cxp_id,
    p_monto: numericoBd(paraBd(r.data.monto)),
    p_metodo: r.data.metodo,
    p_referencia: r.data.referencia,
  });
  if (error) return fallo(/supera/.test(error.message) ? "El pago supera lo que se debe" : "No pudimos registrar el pago");
  revalidatePath("/compras/pagos");
  return ok(undefined);
}

export async function devolverAProveedor(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, permiso)) return fallo("No tienes permiso");
  const r = esquemaDevolucionProveedor.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("registrar_devolucion_proveedor", {
    p_org: ctx.organizacionId,
    p_proveedor: r.data.proveedor_id,
    p_bodega: r.data.bodega_id,
    p_lineas: r.data.lineas.map((l) => ({ producto_id: l.producto_id, cantidad: cantidadParaBd(l.cantidad) })),
    p_motivo: r.data.motivo,
    p_compra: r.data.compra_id ?? undefined,
  });
  if (error || !data) return fallo(/No hay suficiente stock/.test(error?.message ?? "") ? "No hay suficiente stock para devolver esa cantidad" : "No pudimos registrar la devolución");
  revalidatePath("/compras");
  revalidatePath("/inventario");
  revalidatePath("/compras/pagos");
  return ok({ id: data });
}
