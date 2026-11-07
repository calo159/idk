import { z } from "zod";
import { montoTexto } from "./productos";
import { zMotivo, zUuid } from "./comunes";
import { leerNumeroCO } from "@/lib/dinero";

const cantidadTexto = z.string().transform((v, ctx) => {
  const n = leerNumeroCO(v);
  if (n === null) {
    ctx.addIssue({ code: "custom", message: "Ingresa una cantidad" });
    return z.NEVER;
  }
  if (n.decimalPlaces() > 3) {
    ctx.addIssue({ code: "custom", message: "Máximo 3 decimales" });
    return z.NEVER;
  }
  if (n.abs().gt(99_999_999_999.999)) {
    ctx.addIssue({ code: "custom", message: "La cantidad es demasiado grande" });
    return z.NEVER;
  }
  return n.toNumber();
});

/**
 * Ajuste manual. `entrada`/`salida`: cantidad > 0 que se suma o resta.
 * `conteo`: cantidad física contada (≥ 0); la diferencia contra el sistema se calcula en el servidor.
 */
export const esquemaAjuste = z
  .object({
    producto_id: zUuid,
    bodega_id: zUuid,
    modo: z.enum(["entrada", "salida", "conteo"], { message: "Elige el tipo de ajuste" }),
    cantidad: cantidadTexto,
    motivo: zMotivo,
    costo: montoTexto(0),
  })
  .superRefine((v, ctx) => {
    if (v.modo !== "conteo" && v.cantidad <= 0)
      ctx.addIssue({ code: "custom", path: ["cantidad"], message: "Debe ser mayor a cero" });
    if (v.modo === "conteo" && v.cantidad < 0)
      ctx.addIssue({ code: "custom", path: ["cantidad"], message: "No puede ser negativa" });
  });
export type DatosAjuste = z.infer<typeof esquemaAjuste>;
