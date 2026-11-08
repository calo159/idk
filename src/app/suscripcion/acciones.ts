"use server";

import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { entornoPublico, entornoServidor } from "@/lib/env";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, fallo, ok } from "@/lib/validaciones/comunes";
import { MESES_PERMITIDOS } from "@/lib/suscripcion";
import { aCentavos, urlCheckout } from "@/lib/wompi";

const esquema = z.object({
  plan: z.string().regex(/^[a-z]+$/, "Plan inválido"),
  meses: z.number().refine((m) => (MESES_PERMITIDOS as readonly number[]).includes(m), "Elige 1, 3, 6 o 12 meses"),
});

/** Crea el pago pendiente y devuelve la dirección del checkout de Wompi a la que hay que enviar a la persona. */
export async function iniciarPagoSuscripcion(entrada: unknown): Promise<ResultadoAccion<{ url: string }>> {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") return fallo("Solo el dueño o un administrador paga la suscripción");
  const r = esquema.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos");
  const { WOMPI_PUBLIC_KEY, WOMPI_INTEGRITY_SECRET } = entornoServidor();
  if (!WOMPI_PUBLIC_KEY || !WOMPI_INTEGRITY_SECRET) return fallo("El pago en línea aún no está disponible. Escríbenos y te ayudamos a pagar.");

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("iniciar_pago_suscripcion", { p_org: ctx.organizacionId, p_plan: r.data.plan, p_meses: r.data.meses });
  const pago = data?.[0];
  if (error || !pago) {
    const m = error?.message ?? "";
    return fallo(/más usuarios|más bodegas|existe|Elige|pendientes/.test(m) ? m : "No pudimos iniciar el pago. Intenta de nuevo.");
  }
  return ok({
    url: urlCheckout({
      llavePublica: WOMPI_PUBLIC_KEY,
      referencia: pago.referencia,
      centavos: aCentavos(pago.monto),
      secretoIntegridad: WOMPI_INTEGRITY_SECRET,
      urlRetorno: `${entornoPublico().NEXT_PUBLIC_APP_URL}/suscripcion`,
    }),
  });
}
