"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { esquemaProveedor } from "@/lib/validaciones/compras";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zUuid } from "@/lib/validaciones/comunes";

export async function guardarProveedor(
  _prev: ResultadoAccion | null,
  f: FormData,
): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "proveedores")) return fallo("No tienes permiso para editar proveedores");
  const r = esquemaProveedor.safeParse({
    nombre: String(f.get("nombre") ?? ""),
    nit: String(f.get("nit") ?? ""),
    telefono: String(f.get("telefono") ?? ""),
    contacto: String(f.get("contacto") ?? ""),
  });
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));

  const fila = {
    nombre: r.data.nombre,
    nit: r.data.nit ?? null,
    telefono: r.data.telefono ?? null,
    contacto: r.data.contacto ?? null,
  };
  const supabase = await crearClienteServidor();
  const idCrudo = String(f.get("id") ?? "");
  if (idCrudo) {
    const id = zUuid.safeParse(idCrudo);
    if (!id.success) return fallo("Proveedor inválido");
    const { error } = await supabase
      .from("proveedores")
      .update(fila)
      .eq("id", id.data)
      .eq("organizacion_id", ctx.organizacionId);
    if (error) return fallo("No pudimos guardar el proveedor");
  } else {
    const { error } = await supabase
      .from("proveedores")
      .insert({ ...fila, organizacion_id: ctx.organizacionId });
    if (error) return fallo("No pudimos guardar el proveedor");
  }
  revalidatePath("/proveedores");
  return ok(undefined);
}

export async function activarProveedor(id: string, activo: boolean): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "proveedores")) return fallo("No tienes permiso");
  const uid = zUuid.safeParse(id);
  if (!uid.success) return fallo("Proveedor inválido");
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("proveedores")
    .update({ activo })
    .eq("id", uid.data)
    .eq("organizacion_id", ctx.organizacionId);
  if (error) return fallo("No pudimos actualizar");
  revalidatePath("/proveedores");
  return ok(undefined);
}
