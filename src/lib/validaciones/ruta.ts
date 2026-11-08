import { z } from "zod";
import { zOfflineId, zUuid } from "./comunes";

export const RESULTADOS_VISITA = ["pedido", "cobro", "sin_pedido", "cerrado", "no_estaba"] as const;
export type ResultadoVisita = (typeof RESULTADOS_VISITA)[number];

export const ETIQUETA_RESULTADO: Record<ResultadoVisita, string> = {
  pedido: "Hice un pedido / venta",
  cobro: "Cobré una deuda",
  sin_pedido: "Estaba, pero no pidió",
  cerrado: "Estaba cerrado",
  no_estaba: "No estaba el encargado",
};

/** Visita de ruta. `visitado_en` es el momento real (puede ser de hace horas si se hizo sin internet). */
export const esquemaVisita = z
  .object({
    offline_id: zOfflineId,
    cliente_id: zUuid,
    resultado: z.enum(RESULTADOS_VISITA, { message: "Elige cómo te fue en la visita" }),
    nota: z.string().trim().max(300, "La nota debe tener máximo 300 caracteres").nullish().transform((v) => v || null),
    lat: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
    lng: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
    precision_m: z.number().int().min(0).max(100_000).nullish().transform((v) => v ?? null),
    visitado_en: z.iso
      .datetime({ offset: true, message: "Fecha inválida" })
      .optional()
      .refine((v) => {
        if (!v) return true;
        const t = Date.parse(v);
        const ahora = Date.now();
        return t <= ahora + 5 * 60_000 && t >= ahora - 7 * 86_400_000;
      }, "La fecha de la visita no es válida"),
  })
  .refine((v) => (v.lat === null) === (v.lng === null), "La ubicación está incompleta");
