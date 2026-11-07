import { z } from "zod";
import { zPorcentaje, zUuid } from "./comunes";
import { montoTexto } from "./productos";

export const esquemaMeta = z.object({
  usuario_id: zUuid,
  meta: montoTexto(0),
});

export const esquemaComision = z.object({
  usuario_id: z.string().transform((v) => (v === "" ? null : v)).pipe(zUuid.nullable()),
  base: z.enum(["ventas", "utilidad"], { message: "Elige sobre qué se calcula" }),
  porcentaje: z.string().transform((v) => Number(v.replace(",", ".") || "0")).pipe(zPorcentaje),
  bono: z.string().transform((v) => Number(v.replace(",", ".") || "0")).pipe(zPorcentaje),
});

/** Primer día del mes (AAAA-MM-01) de una fecha AAAA-MM-DD. */
export const primerDiaDelMes = (dia: string) => `${dia.slice(0, 7)}-01`;

export const zMes = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Mes inválido")
  .transform((m) => `${m}-01`);
