"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { paraBd } from "@/lib/dinero";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, fallo, ok, zMonto, zUuid } from "@/lib/validaciones/comunes";

const numericoBd = (v: string) => v as unknown as number;
const configEsquema = z.object({
  activa: z.boolean(),
  pesosPorPunto: zMonto.refine((v) => v >= 100, "Cada punto debe costar al menos $ 100"),
  valorPunto: zMonto.refine((v) => v > 0, "El punto debe valer algo"),
  puntosCumpleanos: z.number().int().min(0, "No puede ser negativo").max(10000),
});

export async function guardarFidelizacion(entrada: unknown): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") return fallo("Solo el dueño o un administrador configura la fidelización");
  const r = configEsquema.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("configurar_fidelizacion", {
    p_org: ctx.organizacionId,
    p_activa: r.data.activa,
    p_pesos_por_punto: numericoBd(paraBd(r.data.pesosPorPunto)),
    p_valor_punto: numericoBd(paraBd(r.data.valorPunto)),
    p_puntos_cumple: r.data.puntosCumpleanos,
  });
  if (error) return fallo("No pudimos guardar la configuración");
  revalidatePath("/clientes/fidelizacion");
  revalidatePath("/ventas/pos");
  return ok(undefined);
}

const contactoEsquema = z.object({ clienteId: zUuid, tipo: z.enum(["cumpleanos", "inactivo"]) });

/** El vendedor ya escribió por WhatsApp: se registra para no volver a mostrarlo (el cumpleaños suma sus puntos de bono). */
export async function marcarContactado(entrada: unknown): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  const r = contactoEsquema.safeParse(entrada);
  if (!r.success) return fallo("Datos inválidos");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("marcar_contacto_fidelizacion", { p_org: ctx.organizacionId, p_cliente: r.data.clienteId, p_tipo: r.data.tipo });
  if (error) return fallo("No pudimos registrar el contacto");
  revalidatePath("/clientes/fidelizacion");
  return ok(undefined);
}
