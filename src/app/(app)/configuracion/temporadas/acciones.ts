"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zTexto, zUuid } from "@/lib/validaciones/comunes";

const numericoBd = (v: string) => v as unknown as number;
const admin = (rol: string) => rol === "dueno" || rol === "admin";
const mmdd = z.string().regex(/^\d{2}-\d{2}$/, "Usa mes y día");

const esquema = z.object({
  nombre: zTexto(2, 60, "El nombre"),
  desde: mmdd,
  hasta: mmdd,
  factor: z.string().transform((v) => Number(v.replace(",", "."))).pipe(z.number().min(0.1, "Mínimo 0,1").max(10, "Máximo 10")),
  categoria_id: z.string().transform((v) => (v === "" ? null : v)).pipe(zUuid.nullable()),
});

const parte = (s: string) => ({ mes: Number(s.slice(0, 2)), dia: Number(s.slice(3, 5)) });

export async function guardarTemporada(_p: ResultadoAccion | null, f: FormData): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!admin(ctx.rol)) return fallo("Solo el dueño o un administrador edita temporadas");
  const r = esquema.safeParse(Object.fromEntries(["nombre", "desde", "hasta", "factor", "categoria_id"].map((k) => [k, String(f.get(k) ?? "")])));
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));
  const d = parte(r.data.desde);
  const h = parte(r.data.hasta);
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_temporada", {
    p_org: ctx.organizacionId, p_nombre: r.data.nombre, p_mes_ini: d.mes, p_dia_ini: d.dia, p_mes_fin: h.mes, p_dia_fin: h.dia,
    p_factor: numericoBd(String(r.data.factor)), p_categoria: r.data.categoria_id as unknown as string,
  });
  if (error) return fallo(/Fecha inválida/.test(error.message) ? "Esa fecha no existe" : "No pudimos guardar la temporada");
  revalidatePath("/configuracion/temporadas");
  return ok(undefined);
}

export async function alternarTemporada(id: string, activa: boolean): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!admin(ctx.rol)) return fallo("Sin permiso");
  const u = zUuid.safeParse(id);
  if (!u.success) return fallo("Temporada inválida");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("activar_temporada", { p_id: u.data, p_activa: activa });
  if (error) return fallo("No pudimos actualizar la temporada");
  revalidatePath("/configuracion/temporadas");
  return ok(undefined);
}

export async function cargarBase(): Promise<ResultadoAccion<{ creadas: number }>> {
  const ctx = await requerirContexto();
  if (!admin(ctx.rol)) return fallo("Sin permiso");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("cargar_temporadas_base", { p_org: ctx.organizacionId });
  if (error) return fallo("No pudimos cargar las temporadas");
  revalidatePath("/configuracion/temporadas");
  return ok({ creadas: Number(data) });
}
