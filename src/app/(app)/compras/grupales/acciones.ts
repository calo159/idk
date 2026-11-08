"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { cantidadParaBd } from "@/lib/dinero";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, fallo, ok, zUuid } from "@/lib/validaciones/comunes";

const numericoBd = (v: string) => v as unknown as number;
/** Los mensajes de la base de datos para estos casos ya están en español claro. */
const CLAROS = /Solo dueño|cantidad mínima|cantidad máxima|ya no está abierta|Ya no puedes|aún no se ha cerrado|no participó|Producto no existe|Sin permiso/;

export async function unirseOferta(entrada: unknown): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  const r = z.object({ oferta: zUuid, cantidad: z.number().positive("Escribe la cantidad").max(1_000_000) }).safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa la cantidad");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("comprometer_compra_grupal", { p_org: ctx.organizacionId, p_oferta: r.data.oferta, p_cantidad: numericoBd(cantidadParaBd(r.data.cantidad)) });
  if (error) return fallo(CLAROS.test(error.message) ? error.message : "No pudimos registrar tu compromiso");
  revalidatePath("/compras/grupales");
  return ok(undefined);
}

export async function retirarseDeOferta(oferta: string): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  const id = zUuid.safeParse(oferta);
  if (!id.success) return fallo("Oferta inválida");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("retirar_compromiso_grupal", { p_org: ctx.organizacionId, p_oferta: id.data });
  if (error) return fallo(CLAROS.test(error.message) ? error.message : "No pudimos retirarte de la compra");
  revalidatePath("/compras/grupales");
  return ok(undefined);
}

export async function crearOrdenDeOferta(entrada: unknown): Promise<ResultadoAccion<{ orden: string }>> {
  const ctx = await requerirContexto();
  const r = z.object({ oferta: zUuid, producto: zUuid, bodega: zUuid }).safeParse(entrada);
  if (!r.success) return fallo("Elige el producto y la bodega");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("crear_orden_desde_oferta", { p_org: ctx.organizacionId, p_oferta: r.data.oferta, p_producto: r.data.producto, p_bodega: r.data.bodega });
  if (error || !data) return fallo(error && CLAROS.test(error.message) ? error.message : "No pudimos crear la orden de compra");
  revalidatePath("/compras/grupales");
  revalidatePath("/compras");
  return ok({ orden: data });
}
