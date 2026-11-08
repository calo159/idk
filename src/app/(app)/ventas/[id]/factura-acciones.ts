"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, fallo, ok, zUuid } from "@/lib/validaciones/comunes";
import { procesarCola } from "@/server/facturacion/procesar";
import { PROVEEDORES } from "@/server/facturacion/proveedores";

/** Mensajes de la base de datos que ya están en español claro para el usuario. */
const CLAROS = /Sin permiso|no está activa|venta confirmada|resolución|numeración|consumidor final|Esta venta|rechazada o con error|no tiene valor/;

async function enviarYRevalidar(ventaId: string) {
  try {
    await procesarCola(crearClienteAdmin(), PROVEEDORES, 5);
  } catch {
    // Si el envío inmediato falla no pasa nada: la factura queda en cola y el procesador la reintenta.
  }
  revalidatePath(`/ventas/${ventaId}`);
}

export async function solicitarFactura(ventaId: string): Promise<ResultadoAccion> {
  await requerirContexto();
  const id = zUuid.safeParse(ventaId);
  if (!id.success) return fallo("Venta inválida");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("solicitar_factura_electronica", { p_venta: id.data });
  if (error) return fallo(CLAROS.test(error.message) ? error.message : "No pudimos crear la factura");
  await enviarYRevalidar(id.data);
  return ok(undefined);
}

export async function reintentarFactura(facturaId: string, ventaId: string): Promise<ResultadoAccion> {
  await requerirContexto();
  const f = zUuid.safeParse(facturaId);
  const v = zUuid.safeParse(ventaId);
  if (!f.success || !v.success) return fallo("Factura inválida");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("reintentar_factura_electronica", { p_factura: f.data });
  if (error) return fallo(CLAROS.test(error.message) ? error.message : "No pudimos reintentar la factura");
  await enviarYRevalidar(v.data);
  return ok(undefined);
}
