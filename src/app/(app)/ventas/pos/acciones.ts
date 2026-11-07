"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { ResultadoAccion } from "@/lib/validaciones/comunes";
import { type VentaRegistrada, registrarVenta } from "@/server/ventas";

/** Cobra la venta del POS (idempotente por offline_id). */
export async function cobrarVenta(entrada: unknown): Promise<ResultadoAccion<VentaRegistrada>> {
  const ctx = await requerirContexto();
  const supabase = await crearClienteServidor();
  const r = await registrarVenta(supabase, ctx, entrada);
  if (r.ok) {
    revalidatePath("/inventario");
    revalidatePath("/caja");
    revalidatePath("/ventas/historial");
    revalidatePath("/dashboard");
  }
  return r;
}
