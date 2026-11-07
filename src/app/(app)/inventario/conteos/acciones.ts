"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { cantidadParaBd } from "@/lib/dinero";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { esquemaConteoLinea, esquemaConteoNuevo } from "@/lib/validaciones/bodegas";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zUuid } from "@/lib/validaciones/comunes";

const numericoBd = (v: string) => v as unknown as number;

export async function iniciarConteo(_prev: ResultadoAccion | null, f: FormData): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "inventario.ajustar")) return fallo("No tienes permiso para hacer conteos");
  const r = esquemaConteoNuevo.safeParse({
    bodega_id: String(f.get("bodega_id") ?? ""),
    nombre: String(f.get("nombre") ?? ""),
    categoria_id: String(f.get("categoria_id") ?? ""),
  });
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("iniciar_conteo", {
    p_org: ctx.organizacionId,
    p_bodega: r.data.bodega_id,
    p_nombre: r.data.nombre,
    p_categoria: r.data.categoria_id,
  });
  if (error || !data)
    return fallo(/en curso/.test(error?.message ?? "") ? "Ya hay un conteo en curso para esa bodega" : "No pudimos iniciar el conteo");
  revalidatePath("/inventario/conteos");
  redirect(`/inventario/conteos/${data}`);
}

/** Guarda lo contado de un producto. Devuelve la diferencia solo al dueño/admin (el conteo es ciego para quien cuenta). */
export async function contarProducto(conteoId: string, productoId: string, cantidad: string): Promise<ResultadoAccion<{ diferencia: string | null }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "inventario.ajustar")) return fallo("No tienes permiso");
  const r = esquemaConteoLinea.safeParse({ conteo_id: conteoId, producto_id: productoId, cantidad });
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Cantidad inválida");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("registrar_conteo_producto", {
    p_conteo: r.data.conteo_id,
    p_producto: r.data.producto_id,
    p_cantidad: numericoBd(cantidadParaBd(r.data.cantidad)),
  });
  if (error) return fallo(/cerrado/.test(error.message) ? "El conteo ya está cerrado" : "No pudimos guardar el conteo");
  const verDiferencia = ctx.rol === "dueno" || ctx.rol === "admin";
  return ok({ diferencia: verDiferencia ? String(data) : null });
}

export async function cerrarConteo(conteoId: string, aplicar: boolean): Promise<ResultadoAccion<{ diferencias: number }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "ventas.anular")) return fallo("Solo el dueño o un administrador cierra conteos");
  const id = zUuid.safeParse(conteoId);
  if (!id.success) return fallo("Conteo inválido");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("cerrar_conteo", { p_conteo: id.data, p_aplicar: aplicar });
  if (error) return fallo("No pudimos cerrar el conteo");
  revalidatePath(`/inventario/conteos/${id.data}`);
  revalidatePath("/inventario");
  return ok({ diferencias: Number(data) });
}

export async function cancelarConteo(conteoId: string): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "ventas.anular")) return fallo("Solo el dueño o un administrador cancela conteos");
  const id = zUuid.safeParse(conteoId);
  if (!id.success) return fallo("Conteo inválido");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("cancelar_conteo", { p_conteo: id.data });
  if (error) return fallo("No pudimos cancelar el conteo");
  revalidatePath("/inventario/conteos");
  return ok(undefined);
}
