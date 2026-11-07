"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { cantidadParaBd, paraBd } from "@/lib/dinero";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok } from "@/lib/validaciones/comunes";
import {
  esquemaAbonoSeparado,
  esquemaCancelarSeparado,
  esquemaEntregaSeparado,
  esquemaSeparado,
} from "@/lib/validaciones/ventas-extra";

const numericoBd = (v: string) => v as unknown as number;

async function turnoAbierto(ctxOrg: string, usuario: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("organizacion_id", ctxOrg)
    .eq("usuario_id", usuario)
    .eq("estado", "abierto")
    .maybeSingle();
  return { supabase, turno: data?.id as string | undefined };
}

function mensaje(m: string, porDefecto: string): string {
  if (/turno de caja abierto|Necesitas tu turno/.test(m)) return "Abre tu caja primero (los pagos en efectivo entran a la caja).";
  if (/supera lo que falta/.test(m)) return "El abono supera lo que falta por pagar.";
  if (/deben sumar/.test(m)) return "Los pagos deben sumar exactamente lo que falta.";
  if (/no está activo/.test(m)) return "Este separado ya no está activo.";
  return porDefecto;
}

export async function crearSeparado(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "ventas.confirmar")) return fallo("No tienes permiso para crear separados");
  const r = esquemaSeparado.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos", erroresPorCampo(r.error));
  const { supabase, turno } = await turnoAbierto(ctx.organizacionId, ctx.usuarioId);
  const { data, error } = await supabase.rpc("crear_separado", {
    p_org: ctx.organizacionId,
    p_cliente: r.data.cliente_id,
    p_bodega: r.data.bodega_id,
    p_lineas: r.data.lineas.map((l) => ({
      producto_id: l.producto_id,
      presentacion_id: l.presentacion_id,
      cantidad: cantidadParaBd(l.cantidad),
      precio: paraBd(l.precio),
    })),
    p_fecha_limite: r.data.fecha_limite,
    p_nota: r.data.nota,
    p_abono: numericoBd(paraBd(r.data.abono_inicial)),
    p_metodo: r.data.metodo,
    p_turno: turno,
  });
  if (error || !data) return fallo(mensaje(error?.message ?? "", "No pudimos crear el separado"));
  revalidatePath("/ventas/separados");
  revalidatePath("/caja");
  return ok({ id: data });
}

export async function abonarSeparado(entrada: unknown): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "abonos.registrar")) return fallo("No tienes permiso para recibir abonos");
  const r = esquemaAbonoSeparado.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos", erroresPorCampo(r.error));
  const { supabase, turno } = await turnoAbierto(ctx.organizacionId, ctx.usuarioId);
  const { error } = await supabase.rpc("abonar_separado", {
    p_separado: r.data.separado_id,
    p_monto: numericoBd(paraBd(r.data.monto)),
    p_metodo: r.data.metodo,
    p_turno: turno,
  });
  if (error) return fallo(mensaje(error.message, "No pudimos registrar el abono"));
  revalidatePath("/ventas/separados");
  revalidatePath("/caja");
  return ok(undefined);
}

export async function entregarSeparado(entrada: unknown): Promise<ResultadoAccion<{ ventaId: string }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "ventas.confirmar")) return fallo("No tienes permiso para entregar");
  const r = esquemaEntregaSeparado.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos", erroresPorCampo(r.error));
  const { supabase, turno } = await turnoAbierto(ctx.organizacionId, ctx.usuarioId);
  if (!turno) return fallo("Abre tu caja primero para entregar el pedido.");
  const { data, error } = await supabase.rpc("entregar_separado", {
    p_separado: r.data.separado_id,
    p_pagos: r.data.pagos.filter((p) => p.monto > 0).map((p) => ({ metodo: p.metodo, monto: paraBd(p.monto) })),
    p_turno: turno,
  });
  if (error || !data) return fallo(mensaje(error?.message ?? "", "No pudimos entregar el pedido"));
  revalidatePath("/ventas/separados");
  revalidatePath("/inventario");
  revalidatePath("/caja");
  return ok({ ventaId: data });
}

export async function cancelarSeparado(entrada: unknown): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") return fallo("Solo el dueño o un administrador cancela separados");
  const r = esquemaCancelarSeparado.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Escribe el motivo", erroresPorCampo(r.error));
  const { supabase, turno } = await turnoAbierto(ctx.organizacionId, ctx.usuarioId);
  const { error } = await supabase.rpc("cancelar_separado", { p_separado: r.data.separado_id, p_motivo: r.data.motivo, p_turno: turno });
  if (error) return fallo(mensaje(error.message, "No pudimos cancelar el separado"));
  revalidatePath("/ventas/separados");
  revalidatePath("/caja");
  return ok(undefined);
}
