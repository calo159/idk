"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { paraBd } from "@/lib/dinero";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { esquemaComision, esquemaMeta, zMes } from "@/lib/validaciones/comisiones";
import { type ResultadoAccion, erroresPorCampo, fallo, ok } from "@/lib/validaciones/comunes";

const numericoBd = (v: string) => v as unknown as number;
const campo = (f: FormData, n: string) => String(f.get(n) ?? "");
const esAdmin = (rol: string) => rol === "dueno" || rol === "admin";

export async function guardarMeta(_prev: ResultadoAccion | null, f: FormData): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!esAdmin(ctx.rol)) return fallo("Solo el dueño o un administrador fija metas");
  const r = esquemaMeta.safeParse({ usuario_id: campo(f, "usuario_id"), meta: campo(f, "meta") });
  const mes = zMes.safeParse(campo(f, "mes"));
  if (!r.success || !mes.success) return fallo("Revisa los datos", r.success ? undefined : erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("fijar_meta", {
    p_org: ctx.organizacionId,
    p_usuario: r.data.usuario_id,
    p_mes: mes.data,
    p_meta: numericoBd(paraBd(r.data.meta)),
  });
  if (error) return fallo("No pudimos guardar la meta");
  revalidatePath("/reportes/comisiones");
  return ok(undefined);
}

export async function guardarComision(_prev: ResultadoAccion | null, f: FormData): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!esAdmin(ctx.rol)) return fallo("Solo el dueño o un administrador fija comisiones");
  const r = esquemaComision.safeParse({
    usuario_id: campo(f, "usuario_id"),
    base: campo(f, "base"),
    porcentaje: campo(f, "porcentaje"),
    bono: campo(f, "bono"),
  });
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("fijar_comision", {
    p_org: ctx.organizacionId,
    // Sin vendedor = regla general del negocio (SQL acepta null).
    p_usuario: r.data.usuario_id as unknown as string,
    p_base: r.data.base,
    p_porcentaje: numericoBd(String(r.data.porcentaje)),
    p_bono: numericoBd(String(r.data.bono)),
  });
  if (error) return fallo("No pudimos guardar la regla de comisión");
  revalidatePath("/reportes/comisiones");
  return ok(undefined);
}
