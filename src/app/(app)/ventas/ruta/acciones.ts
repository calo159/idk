"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok } from "@/lib/validaciones/comunes";
import { esquemaVisita } from "@/lib/validaciones/ruta";

const numericoBd = (v: number) => v as unknown as number;

/** Registra una visita de ruta (idempotente por offline_id: reintentar o sincronizar dos veces no la duplica). */
export async function registrarVisita(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  const ctx = await requerirContexto();
  const r = esquemaVisita.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos de la visita", erroresPorCampo(r.error));
  const d = r.data;
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("registrar_visita", {
    p_org: ctx.organizacionId,
    p_cliente: d.cliente_id,
    p_resultado: d.resultado,
    p_nota: d.nota as string,
    p_lat: d.lat === null ? (null as unknown as number) : numericoBd(d.lat),
    p_lng: d.lng === null ? (null as unknown as number) : numericoBd(d.lng),
    p_precision: d.precision_m as number,
    p_offline_id: d.offline_id,
    p_visitado_en: d.visitado_en as string,
  });
  if (error || !data) {
    const m = error?.message ?? "";
    return fallo(/Cliente no existe/.test(m) ? "Ese cliente ya no existe" : /fecha de la visita/.test(m) ? "La fecha de la visita no es válida" : /permiso/i.test(m) ? "Tu rol no puede registrar visitas" : "No pudimos registrar la visita");
  }
  revalidatePath("/ventas/ruta");
  revalidatePath("/reportes/visitas");
  return ok({ id: data });
}
