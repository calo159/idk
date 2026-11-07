"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { cantidadParaBd } from "@/lib/dinero";
import { puede, puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { esquemaBodega, esquemaTraslado } from "@/lib/validaciones/bodegas";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zMotivo, zUuid } from "@/lib/validaciones/comunes";

/** Mueve mercancía entre bodegas de forma atómica (salida + entrada con el mismo costo). */
export async function crearTraslado(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "inventario.ajustar")) return fallo("No tienes permiso para trasladar inventario");
  const r = esquemaTraslado.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("trasladar_inventario", {
    p_org: ctx.organizacionId,
    p_origen: r.data.bodega_origen_id,
    p_destino: r.data.bodega_destino_id,
    p_lineas: r.data.lineas.map((l) => ({ producto_id: l.producto_id, cantidad: cantidadParaBd(l.cantidad) })),
    p_nota: r.data.nota,
  });
  if (error || !data) {
    const m = error?.message ?? "";
    return fallo(/No hay suficiente stock/.test(m) ? m.replace(/^.*?No hay/, "No hay") : "No pudimos registrar el traslado");
  }
  revalidatePath("/inventario");
  revalidatePath("/inventario/traslados");
  return ok({ id: data });
}

export async function anularTraslado(trasladoId: string, motivo: string): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "ventas.anular")) return fallo("Solo el dueño o un administrador anula traslados");
  const id = zUuid.safeParse(trasladoId);
  const m = zMotivo.safeParse(motivo);
  if (!id.success || !m.success) return fallo("Escribe el motivo de la anulación");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anular_traslado", { p_traslado: id.data, p_motivo: m.data });
  if (error)
    return fallo(/ya no tiene/.test(error.message) ? "El destino ya no tiene esa mercancía: no se puede anular." : "No pudimos anular el traslado");
  revalidatePath("/inventario/traslados");
  revalidatePath("/inventario");
  return ok(undefined);
}

export async function crearBodega(_prev: ResultadoAccion | null, f: FormData): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "bodegas")) return fallo("Solo el dueño o un administrador crea bodegas");
  const r = esquemaBodega.safeParse({ nombre: String(f.get("nombre") ?? "") });
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("bodegas").insert({ organizacion_id: ctx.organizacionId, nombre: r.data.nombre });
  if (error) return fallo("No pudimos crear la bodega");
  revalidatePath("/configuracion/bodegas");
  return ok(undefined);
}

export async function activarBodega(bodegaId: string, activa: boolean): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "bodegas")) return fallo("Sin permiso");
  const id = zUuid.safeParse(bodegaId);
  if (!id.success) return fallo("Bodega inválida");
  const supabase = await crearClienteServidor();
  const { data: b } = await supabase.from("bodegas").select("es_principal").eq("id", id.data).eq("organizacion_id", ctx.organizacionId).maybeSingle();
  if (b?.es_principal && !activa) return fallo("La bodega principal no se puede desactivar");
  const { error } = await supabase.from("bodegas").update({ activa }).eq("id", id.data).eq("organizacion_id", ctx.organizacionId);
  if (error) return fallo("No pudimos actualizar la bodega");
  revalidatePath("/configuracion/bodegas");
  return ok(undefined);
}
