"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ResultadoAccion, fallo, ok, zDia, zUuid } from "@/lib/validaciones/comunes";
import { requerirDistribuidor } from "@/server/distribuidor";

const numericoBd = (v: number) => v as unknown as number;
const CLAROS = /entre mañana|antes del cierre|escalas|menor al precio|debe bajar|crecientes|Revisa los datos|ya no está abierta|motivo|Solo se marca|Oferta no existe|No tienes permiso/;

const esquemaOferta = z.object({
  titulo: z.string().trim().min(3, "El título debe tener al menos 3 letras").max(120),
  descripcion: z.string().trim().max(500),
  unidad: z.string().trim().min(1, "Escribe la unidad (bulto, caja, galón…)").max(30),
  precioReferencia: z.number().positive("Escribe el precio normal"),
  cierraEn: zDia,
  entrega: zDia.or(z.literal("")),
  minimoNegocio: z.number().positive("El mínimo por negocio debe ser mayor a cero"),
  maximoNegocio: z.number().positive().nullable(),
  escalas: z.array(z.object({ desde: z.number().positive("Cada escala necesita una cantidad"), precio: z.number().positive("Cada escala necesita un precio") })).min(1, "Agrega al menos una escala").max(6),
});

export async function publicarOferta(entrada: unknown): Promise<ResultadoAccion<{ id: string }>> {
  const { supabase, distribuidor } = await requerirDistribuidor();
  const r = esquemaOferta.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos de la oferta");
  const d = r.data;
  const { data, error } = await supabase.rpc("crear_oferta_grupal", {
    p_distribuidor: distribuidor.id,
    p_titulo: d.titulo,
    p_descripcion: d.descripcion,
    p_unidad: d.unidad,
    p_precio_referencia: numericoBd(d.precioReferencia),
    p_cierra_en: d.cierraEn,
    p_entrega: (d.entrega || null) as string,
    p_minimo_negocio: numericoBd(d.minimoNegocio),
    p_maximo_negocio: (d.maximoNegocio === null ? null : numericoBd(d.maximoNegocio)) as number,
    p_escalas: d.escalas.map((e) => ({ cantidad_desde: e.desde, precio_unitario: e.precio })),
  });
  if (error || !data) return fallo(error && CLAROS.test(error.message) ? error.message : "No pudimos publicar la oferta");
  revalidatePath("/distribuidor");
  return ok({ id: data });
}

const idOferta = z.object({ oferta: zUuid });

async function accion(entrada: unknown, fn: (s: Awaited<ReturnType<typeof requerirDistribuidor>>["supabase"], oferta: string) => PromiseLike<{ error: { message: string } | null }>): Promise<ResultadoAccion> {
  const { supabase } = await requerirDistribuidor();
  const r = idOferta.safeParse(entrada);
  if (!r.success) return fallo("Oferta inválida");
  const { error } = await fn(supabase, r.data.oferta);
  if (error) return fallo(CLAROS.test(error.message) ? error.message : "No pudimos completar la acción");
  revalidatePath(`/distribuidor/ofertas/${r.data.oferta}`);
  revalidatePath("/distribuidor");
  return ok(undefined);
}

export async function cerrarOferta(entrada: unknown): Promise<ResultadoAccion> {
  return accion(entrada, (s, oferta) => s.rpc("cerrar_oferta_grupal", { p_oferta: oferta }));
}
export async function entregarOferta(entrada: unknown): Promise<ResultadoAccion> {
  return accion(entrada, (s, oferta) => s.rpc("entregar_oferta_grupal", { p_oferta: oferta }));
}
export async function cancelarOferta(entrada: unknown): Promise<ResultadoAccion> {
  const r = z.object({ oferta: zUuid, motivo: z.string().trim().min(3, "Escribe el motivo de la cancelación").max(300) }).safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Escribe el motivo");
  return accion({ oferta: r.data.oferta }, (s, oferta) => s.rpc("cancelar_oferta_grupal", { p_oferta: oferta, p_motivo: r.data.motivo }));
}
