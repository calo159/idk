import { z } from "zod";
import { zCantidad, zTexto, zUuid } from "./comunes";
import { montoTexto } from "./productos";

export const esquemaBodega = z.object({ nombre: zTexto(2, 60, "El nombre de la bodega") });

export const esquemaTraslado = z
  .object({
    bodega_origen_id: zUuid,
    bodega_destino_id: zUuid,
    nota: z
      .string()
      .trim()
      .max(200)
      .transform((v) => (v === "" ? undefined : v))
      .optional(),
    lineas: z
      .array(z.object({ producto_id: zUuid, cantidad: zCantidad }))
      .min(1, "Agrega al menos un producto")
      .max(300),
  })
  .refine((v) => v.bodega_origen_id !== v.bodega_destino_id, {
    message: "La bodega de origen y la de destino deben ser distintas",
    path: ["bodega_destino_id"],
  })
  .refine((v) => new Set(v.lineas.map((l) => l.producto_id)).size === v.lineas.length, {
    message: "Hay productos repetidos en el traslado",
    path: ["lineas"],
  });

export const esquemaConteoNuevo = z.object({
  bodega_id: zUuid,
  nombre: zTexto(3, 80, "El nombre del conteo"),
  categoria_id: z
    .string()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(zUuid.optional()),
});

export const esquemaConteoLinea = z.object({
  conteo_id: zUuid,
  producto_id: zUuid,
  cantidad: montoTexto().pipe(
    z.number().max(99_999_999_999.999).refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, "Máximo 3 decimales"),
  ),
});
