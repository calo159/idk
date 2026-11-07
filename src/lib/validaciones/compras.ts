import { z } from "zod";
import { multiplicar, sumar } from "@/lib/dinero";
import {
  zCantidad,
  zCelularOpcional,
  zDia,
  zDocumentoCO,
  zMonto,
  zMotivo,
  zTexto,
  zTextoOpcional,
  zUuid,
} from "./comunes";

export const esquemaProveedor = z.object({
  nombre: zTexto(2, 120, "El nombre"),
  nit: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(zDocumentoCO.optional()),
  telefono: zCelularOpcional,
  contacto: zTextoOpcional(80),
});

export const esquemaLineaCompra = z.object({
  producto_id: zUuid,
  presentacion_id: zUuid.nullable().default(null),
  cantidad: zCantidad,
  costo_unitario: zMonto,
});

export const esquemaCompra = z.object({
  proveedor_id: zUuid.nullable(),
  bodega_id: zUuid,
  numero_factura: zTextoOpcional(40),
  fecha: zDia,
  documento_ia_id: zUuid.nullish().transform((v) => v ?? null),
  condicion_pago: z.enum(["contado", "credito"]).default("contado"),
  dias_credito: z.number().int().min(0).max(365).default(30),
  lineas: z.array(esquemaLineaCompra).min(1, "Agrega al menos un producto").max(300),
});
export type DatosCompra = z.infer<typeof esquemaCompra>;

export const esquemaAnulacion = z.object({ compra_id: zUuid, motivo: zMotivo });

/** Total de la compra, línea a línea con redondeo de Postgres (igual que `subtotal` generado). */
export function totalCompra(lineas: { cantidad: number | string; costo_unitario: number | string }[]) {
  return sumar(...lineas.map((l) => multiplicar(l.costo_unitario, l.cantidad)));
}
