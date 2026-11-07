"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { esquemaInvitacion } from "@/lib/validaciones/auth";
import {
  type ResultadoAccion,
  erroresPorCampo,
  fallo,
  ok,
  zRol,
  zUuid,
} from "@/lib/validaciones/comunes";

export async function invitarUsuario(
  _prev: ResultadoAccion<{ token: string }> | null,
  f: FormData,
): Promise<ResultadoAccion<{ token: string }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "usuarios.gestionar"))
    return fallo("No tienes permiso para invitar usuarios");
  const r = esquemaInvitacion.safeParse({
    correo: String(f.get("correo") ?? ""),
    nombre: String(f.get("nombre") ?? ""),
    rol: String(f.get("rol") ?? ""),
  });
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("invitaciones")
    .insert({
      organizacion_id: ctx.organizacionId,
      correo: r.data.correo,
      nombre: r.data.nombre ?? null,
      rol: r.data.rol,
      creado_por: ctx.usuarioId,
    })
    .select("token")
    .single();
  if (error || !data) return fallo("No pudimos crear la invitación");
  revalidatePath("/configuracion/usuarios");
  return ok({ token: data.token });
}

export async function cambiarRol(miembroId: string, rol: string): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "usuarios.gestionar")) return fallo("No tienes permiso");
  const id = zUuid.safeParse(miembroId);
  const nuevo = zRol.safeParse(rol);
  if (!id.success || !nuevo.success) return fallo("Datos inválidos");
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("miembros")
    .update({ rol: nuevo.data })
    .eq("organizacion_id", ctx.organizacionId)
    .eq("usuario_id", id.data);
  if (error) return fallo(error.message);
  revalidatePath("/configuracion/usuarios");
  return ok(undefined);
}

export async function activarMiembro(miembroId: string, activo: boolean): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "usuarios.gestionar")) return fallo("No tienes permiso");
  const id = zUuid.safeParse(miembroId);
  if (!id.success) return fallo("Datos inválidos");
  if (id.data === ctx.usuarioId) return fallo("No puedes desactivarte a ti mismo");
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("miembros")
    .update({ activo })
    .eq("organizacion_id", ctx.organizacionId)
    .eq("usuario_id", id.data);
  if (error) return fallo(error.message);
  revalidatePath("/configuracion/usuarios");
  return ok(undefined);
}

export async function cancelarInvitacion(invitacionId: string): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "usuarios.gestionar")) return fallo("No tienes permiso");
  const id = zUuid.safeParse(invitacionId);
  if (!id.success) return fallo("Datos inválidos");
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("invitaciones")
    .delete()
    .eq("id", id.data)
    .eq("organizacion_id", ctx.organizacionId);
  if (error) return fallo("No pudimos cancelar la invitación");
  revalidatePath("/configuracion/usuarios");
  return ok(undefined);
}
