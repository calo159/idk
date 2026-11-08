"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, fallo, ok, zUuid } from "@/lib/validaciones/comunes";

const configEsquema = z.object({
  activo: z.boolean(),
  slug: z.string().trim().max(40, "La dirección es muy larga"),
  telefono: z.string().trim().max(20, "Teléfono inválido"),
  mensaje: z.string().trim().max(200, "El mensaje debe tener máximo 200 caracteres"),
});

/** Los mensajes de la base de datos ya vienen en español claro para estos casos; lo demás se oculta. */
const MENSAJES_CLAROS = /dirección|WhatsApp|Solo dueño/;

export async function guardarCatalogo(entrada: unknown): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") return fallo("Solo el dueño o un administrador configura el catálogo");
  const r = configEsquema.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("configurar_catalogo", {
    p_org: ctx.organizacionId,
    p_activo: r.data.activo,
    p_slug: r.data.slug,
    p_telefono: r.data.telefono,
    p_mensaje: r.data.mensaje,
  });
  if (error) return fallo(MENSAJES_CLAROS.test(error.message) ? error.message : "No pudimos guardar el catálogo");
  revalidatePath("/configuracion/catalogo");
  return ok(undefined);
}

const visibilidadEsquema = z.object({ ids: z.array(zUuid).min(1).max(500), publicar: z.boolean() });

export async function cambiarVisibilidad(entrada: unknown): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") return fallo("Solo el dueño o un administrador edita el catálogo");
  const r = visibilidadEsquema.safeParse(entrada);
  if (!r.success) return fallo("Elige al menos un producto");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("publicar_en_catalogo", { p_org: ctx.organizacionId, p_ids: r.data.ids, p_publicar: r.data.publicar });
  if (error) return fallo("No pudimos cambiar los productos");
  revalidatePath("/configuracion/catalogo");
  return ok(undefined);
}
