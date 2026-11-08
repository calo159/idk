"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { cantidadParaBd, paraBd } from "@/lib/dinero";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { esquemaAnulacion, esquemaCompra } from "@/lib/validaciones/compras";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zUuid } from "@/lib/validaciones/comunes";

const numericoBd = (v: string) => v as unknown as number;

/** Si el negocio activó los precios automáticos, los ajusta tras entrar mercancía nueva. Nunca bloquea la compra. */
async function ajustarPreciosSiAplica(supabase: Awaited<ReturnType<typeof crearClienteServidor>>, org: string) {
  try {
    await supabase.rpc("actualizar_precios_automaticos", { p_org: org });
  } catch {
    /* la compra ya quedó registrada */
  }
}

/** Crea la compra en borrador y, si se pide, la confirma (entra al inventario con costo promedio). */
export async function crearCompra(
  entrada: unknown,
  confirmar: boolean,
): Promise<ResultadoAccion<{ id: string }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "compras.confirmar")) return fallo("No tienes permiso para registrar compras");
  const r = esquemaCompra.safeParse(entrada);
  if (!r.success) return fallo("Revisa los datos de la compra", erroresPorCampo(r.error));
  const d = r.data;
  const supabase = await crearClienteServidor();

  const { data: compra, error } = await supabase
    .from("compras")
    .insert({
      organizacion_id: ctx.organizacionId,
      proveedor_id: d.proveedor_id,
      bodega_id: d.bodega_id,
      numero_factura: d.numero_factura ?? null,
      fecha: d.fecha,
      documento_ia_id: d.documento_ia_id,
      condicion_pago: d.condicion_pago,
      usuario_id: ctx.usuarioId,
    })
    .select("id")
    .single();
  if (error || !compra) return fallo("No pudimos crear la compra");

  const { error: errDetalle } = await supabase.from("compras_detalle").insert(
    d.lineas.map((l) => ({
      organizacion_id: ctx.organizacionId,
      compra_id: compra.id,
      producto_id: l.producto_id,
      presentacion_id: l.presentacion_id,
      cantidad: numericoBd(cantidadParaBd(l.cantidad)),
      costo_unitario: numericoBd(paraBd(l.costo_unitario)),
    })),
  );
  if (errDetalle) {
    await supabase.from("compras").delete().eq("id", compra.id); // borrador sin líneas: se descarta
    return fallo("No pudimos guardar los productos de la compra");
  }

  if (d.documento_ia_id) {
    // La persona revisó y aceptó lo que propuso la IA.
    await supabase
      .from("documentos_ia")
      .update({ estado: "confirmado" })
      .eq("id", d.documento_ia_id)
      .eq("organizacion_id", ctx.organizacionId);
  }

  if (d.condicion_pago === "credito" && !d.proveedor_id) {
    await supabase.from("compras").delete().eq("id", compra.id);
    return fallo("Para comprar a crédito elige un proveedor");
  }

  if (confirmar) {
    const { error: errConf } = await supabase.rpc("confirmar_compra", { p_compra_id: compra.id });
    if (errConf) {
      revalidatePath("/compras");
      return fallo("La compra quedó en borrador, pero no se pudo confirmar. Revísala e inténtalo de nuevo.");
    }
    if (d.condicion_pago === "credito") {
      const { error: errCxp } = await supabase.rpc("registrar_cuenta_por_pagar", { p_compra: compra.id, p_dias: d.dias_credito });
      if (errCxp) return fallo("La compra se confirmó, pero no se pudo crear la cuenta por pagar. Créala desde la compra.");
    }
  }
  if (confirmar) await ajustarPreciosSiAplica(supabase, ctx.organizacionId);
  revalidatePath("/compras");
  revalidatePath("/inventario");
  return ok({ id: compra.id });
}

export async function confirmarCompra(compraId: string): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "compras.confirmar")) return fallo("No tienes permiso");
  const id = zUuid.safeParse(compraId);
  if (!id.success) return fallo("Compra inválida");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("confirmar_compra", { p_compra_id: id.data });
  if (error) return fallo("No pudimos confirmar la compra");
  await ajustarPreciosSiAplica(supabase, ctx.organizacionId);
  revalidatePath("/compras");
  revalidatePath(`/compras/${id.data}`);
  revalidatePath("/inventario");
  return ok(undefined);
}

export async function anularCompra(compraId: string, motivo: string): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "compras.anular")) return fallo("Solo el dueño o un administrador anula compras");
  const r = esquemaAnulacion.safeParse({ compra_id: compraId, motivo });
  if (!r.success) return fallo("Escribe el motivo de la anulación", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anular_compra", {
    p_compra_id: r.data.compra_id,
    p_motivo: r.data.motivo,
  });
  if (error) {
    return fallo(
      /negativ|insuficiente|stock/i.test(error.message)
        ? "No se puede anular: ya se vendió parte de esa mercancía."
        : "No pudimos anular la compra",
    );
  }
  revalidatePath("/compras");
  revalidatePath(`/compras/${r.data.compra_id}`);
  revalidatePath("/inventario");
  return ok(undefined);
}
