import { z } from "zod";
import { zDia, zMotivo, zTexto, zUuid } from "./comunes";
import { montoTexto } from "./productos";

export const CATEGORIAS_GASTO = [
  "Servicios públicos",
  "Arriendo",
  "Nómina y ayudas",
  "Transporte y fletes",
  "Mantenimiento",
  "Impuestos",
  "Papelería y aseo",
  "Alimentación",
  "Otros",
] as const;

export const esquemaGasto = z.object({
  categoria: z.enum(CATEGORIAS_GASTO, { message: "Elige una categoría" }),
  descripcion: zTexto(3, 200, "La descripción"),
  monto: montoTexto().refine((v) => v > 0, "El monto debe ser mayor a cero"),
  metodo: z.enum(["efectivo", "nequi", "daviplata", "transferencia", "tarjeta", "otro"], {
    message: "Elige cómo se pagó",
  }),
  fecha: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(zDia.optional()),
  turno_id: zUuid.nullish().transform((v) => v ?? null),
});

export const esquemaMovimientoCaja = z.object({
  turno_id: zUuid,
  tipo: z.enum(["retiro", "ingreso"], { message: "Elige retiro o ingreso" }),
  monto: montoTexto().refine((v) => v > 0, "El monto debe ser mayor a cero"),
  motivo: zTexto(3, 200, "El motivo"),
});

export const esquemaAnularGasto = z.object({ gasto_id: zUuid, motivo: zMotivo });
