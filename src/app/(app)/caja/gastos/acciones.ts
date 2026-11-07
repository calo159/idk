"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { paraBd } from "@/lib/dinero";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok } from "@/lib/validaciones/comunes";
import { esquemaAnularGasto, esquemaGasto, esquemaMovimientoCaja } from "@/lib/validaciones/gastos";
import { validarFoto } from "@/lib/validaciones/productos";

const numericoBd = (v: string) => v as unknown as number;
const campo = (f: FormData, n: string) => String(f.get(n) ?? "");

export async function registrarGasto(_prev: ResultadoAccion | null, f: FormData): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "gastos.registrar")) return fallo("No tienes permiso para registrar gastos");
  const r = esquemaGasto.safeParse({
    categoria: campo(f, "categoria"),
    descripcion: campo(f, "descripcion"),
    monto: campo(f, "monto"),
    metodo: campo(f, "metodo"),
    fecha: campo(f, "fecha"),
    turno_id: campo(f, "turno_id") || null,
  });
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();

  let soporte: string | null = null;
  const foto = f.get("soporte");
  if (foto instanceof File && foto.size > 0) {
    const problema = validarFoto(foto);
    if (problema) return fallo(problema, { soporte: problema });
    const ext = foto.type === "image/png" ? "png" : foto.type === "image/webp" ? "webp" : "jpg";
    soporte = `${ctx.organizacionId}/gastos/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("documentos-ia").upload(soporte, foto, { contentType: foto.type });
    if (error) return fallo("No pudimos subir el soporte");
  }

  const { error } = await supabase.rpc("registrar_gasto", {
    p_org: ctx.organizacionId,
    p_categoria: r.data.categoria,
    p_descripcion: r.data.descripcion,
    p_monto: numericoBd(paraBd(r.data.monto)),
    p_metodo: r.data.metodo,
    p_soporte: soporte ?? undefined,
    p_fecha: r.data.fecha,
    p_turno: r.data.turno_id ?? undefined,
  });
  if (error) return fallo(/turno/i.test(error.message) ? error.message : "No pudimos registrar el gasto");
  revalidatePath("/caja/gastos");
  revalidatePath("/caja");
  return ok(undefined);
}

export async function anularGasto(gastoId: string, motivo: string): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "gastos.anular")) return fallo("Solo el dueño o un administrador anula gastos");
  const r = esquemaAnularGasto.safeParse({ gasto_id: gastoId, motivo });
  if (!r.success) return fallo("Escribe el motivo", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anular_gasto", { p_gasto: r.data.gasto_id, p_motivo: r.data.motivo });
  if (error) return fallo("No pudimos anular el gasto");
  revalidatePath("/caja/gastos");
  return ok(undefined);
}

export async function moverEfectivo(_prev: ResultadoAccion | null, f: FormData): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "gastos.registrar")) return fallo("No tienes permiso");
  const r = esquemaMovimientoCaja.safeParse({
    turno_id: campo(f, "turno_id"),
    tipo: campo(f, "tipo"),
    monto: campo(f, "monto"),
    motivo: campo(f, "motivo"),
  });
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("registrar_movimiento_caja", {
    p_turno: r.data.turno_id,
    p_tipo: r.data.tipo,
    p_monto: numericoBd(paraBd(r.data.monto)),
    p_motivo: r.data.motivo,
  });
  if (error) return fallo("No pudimos registrar el movimiento de efectivo");
  revalidatePath("/caja");
  return ok(undefined);
}
