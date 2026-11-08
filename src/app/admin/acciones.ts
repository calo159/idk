"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ResultadoAccion, fallo, ok, zUuid } from "@/lib/validaciones/comunes";
import { MESES_PERMITIDOS } from "@/lib/suscripcion";
import { requerirSuperAdmin } from "@/server/admin";

const motivo = z.string().trim().min(3, "Escribe el motivo (mínimo 3 letras)").max(300, "El motivo es muy largo");
const numericoBd = (v: number) => v as unknown as number;

async function ejecutar(fn: (s: Awaited<ReturnType<typeof requerirSuperAdmin>>["supabase"]) => PromiseLike<{ error: { message: string } | null }>, org: string): Promise<ResultadoAccion> {
  const { supabase } = await requerirSuperAdmin();
  const { error } = await fn(supabase);
  if (error) return fallo(/motivo|no existe|entre 1 y 365|Elige|Monto/.test(error.message) ? error.message : "No se pudo completar la acción");
  revalidatePath(`/admin/negocios/${org}`);
  revalidatePath("/admin");
  return ok(undefined);
}

const base = z.object({ org: zUuid, motivo });

export async function cambiarPlanAdmin(entrada: unknown): Promise<ResultadoAccion> {
  const r = base.extend({ plan: z.string().regex(/^[a-z]+$/) }).safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos");
  return ejecutar((s) => s.rpc("admin_cambiar_plan", { p_org: r.data.org, p_plan: r.data.plan, p_motivo: r.data.motivo }), r.data.org);
}

export async function extenderAdmin(entrada: unknown): Promise<ResultadoAccion> {
  const r = base.extend({ dias: z.number().int().min(1).max(365) }).safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Los días deben estar entre 1 y 365");
  return ejecutar((s) => s.rpc("admin_extender_suscripcion", { p_org: r.data.org, p_dias: r.data.dias, p_motivo: r.data.motivo }), r.data.org);
}

export async function suspenderAdmin(entrada: unknown): Promise<ResultadoAccion> {
  const r = base.extend({ suspender: z.boolean() }).safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos");
  return ejecutar((s) => s.rpc("admin_suspender", { p_org: r.data.org, p_suspender: r.data.suspender, p_motivo: r.data.motivo }), r.data.org);
}

export async function pagoManualAdmin(entrada: unknown): Promise<ResultadoAccion> {
  const r = base
    .extend({
      plan: z.string().regex(/^[a-z]+$/),
      meses: z.number().refine((m) => (MESES_PERMITIDOS as readonly number[]).includes(m), "Elige 1, 3, 6 o 12 meses"),
      monto: z.number().min(0).max(999_999_999),
    })
    .safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos");
  return ejecutar((s) => s.rpc("admin_registrar_pago_manual", { p_org: r.data.org, p_plan: r.data.plan, p_meses: r.data.meses, p_monto: numericoBd(r.data.monto), p_motivo: r.data.motivo }), r.data.org);
}

const esquemaDistribuidor = z.object({
  nombre: z.string().trim().min(2, "Escribe el nombre del distribuidor").max(120),
  nit: z.string().trim().max(20),
  telefono: z.string().trim().max(20),
  correo: z.string().trim().toLowerCase().pipe(z.email("Escribe el correo de la persona que lo administrará")),
});

/** Da de alta a un distribuidor y a su primera persona (que ya debe tener cuenta). Solo el equipo de Surtix. */
export async function crearDistribuidorAdmin(entrada: unknown): Promise<ResultadoAccion> {
  const { supabase } = await requerirSuperAdmin();
  const r = esquemaDistribuidor.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos");
  const { error } = await supabase.rpc("admin_crear_distribuidor", { p_nombre: r.data.nombre, p_nit: r.data.nit, p_telefono: r.data.telefono, p_correo: r.data.correo });
  if (error) return fallo(/aún no tiene cuenta/.test(error.message) ? error.message : "No se pudo crear el distribuidor");
  revalidatePath("/admin");
  return ok(undefined);
}
