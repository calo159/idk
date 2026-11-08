"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, fallo, ok } from "@/lib/validaciones/comunes";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida").or(z.literal(""));
const numeroOVacio = z.string().trim().regex(/^\d*$/, "Solo números");
const esquema = z.object({
  activa: z.boolean(),
  ambiente: z.enum(["pruebas", "produccion"]),
  proveedor: z.string().regex(/^[a-z]{3,20}$/, "Proveedor inválido"),
  nit: numeroOVacio,
  dv: z.string().trim().regex(/^\d?$/, "El dígito de verificación es un solo número"),
  razonSocial: z.string().trim().max(160),
  prefijo: z.string().trim().toUpperCase().regex(/^[A-Z]{0,4}$/, "El prefijo son de 1 a 4 letras"),
  resolucionNumero: z.string().trim().max(40),
  resolucionFecha: fecha,
  rangoDesde: numeroOVacio,
  rangoHasta: numeroOVacio,
  vigenciaHasta: fecha,
  consumidorFinalHasta: z.string().trim().regex(/^\d+$/, "Escribe el tope en pesos, solo números"),
});

const numericoBd = (v: number) => v as unknown as number;
const CLAROS = /dueño o admin|completa NIT|simulado|Revisa los datos fiscales/;

export async function guardarFacturacion(entrada: unknown): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") return fallo("Solo el dueño o un administrador configura la facturación");
  const r = esquema.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos");
  const d = r.data;
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("guardar_config_facturacion", {
    p_org: ctx.organizacionId,
    p_activa: d.activa,
    p_ambiente: d.ambiente,
    p_proveedor: d.proveedor,
    p_nit: d.nit,
    p_dv: d.dv,
    p_razon_social: d.razonSocial,
    p_prefijo: d.prefijo,
    p_resolucion_numero: d.resolucionNumero,
    p_resolucion_fecha: (d.resolucionFecha || null) as string,
    p_rango_desde: (d.rangoDesde ? Number(d.rangoDesde) : null) as number,
    p_rango_hasta: (d.rangoHasta ? Number(d.rangoHasta) : null) as number,
    p_vigencia_hasta: (d.vigenciaHasta || null) as string,
    p_consumidor_final_hasta: numericoBd(Number(d.consumidorFinalHasta)),
  });
  if (error) return fallo(CLAROS.test(error.message) ? error.message : "No pudimos guardar la configuración");
  revalidatePath("/configuracion/facturacion");
  return ok(undefined);
}
