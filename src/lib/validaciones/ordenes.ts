import { z } from "zod";
import { multiplicar, sumar } from "@/lib/dinero";
import { hoyBogota } from "@/lib/fechas";
import { zCantidad, zDia, zMetodoPago, zMonto, zTextoOpcional, zTexto, zUuid } from "./comunes";

export const esquemaOrdenCompra = z.object({
  proveedor_id: zUuid,
  bodega_id: zUuid,
  fecha_esperada: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(zDia.optional()),
  nota: zTextoOpcional(200),
  lineas: z
    .array(
      z.object({
        producto_id: zUuid,
        presentacion_id: zUuid.nullish().transform((v) => v ?? null),
        cantidad: zCantidad,
        costo: zMonto,
      }),
    )
    .min(1, "Agrega al menos un producto")
    .max(300),
});

export const esquemaRecibo = z.object({
  orden_id: zUuid,
  factura: zTextoOpcional(40),
  condicion: z.enum(["contado", "credito"], { message: "Elige la condición de pago" }),
  dias_credito: z.number().int().min(0).max(365).default(30),
  lineas: z
    .array(z.object({ detalle_id: zUuid, cantidad: z.number().min(0), costo: zMonto.nullish().transform((v) => v ?? undefined) }))
    .min(1),
});

export const esquemaPagoProveedor = z.object({
  cxp_id: zUuid,
  monto: zMonto.refine((v) => v > 0, "El pago debe ser mayor a cero"),
  metodo: zMetodoPago.refine((m) => m !== "credito", "Un pago no puede ser a crédito"),
  referencia: zTextoOpcional(60),
});

export const esquemaDevolucionProveedor = z.object({
  proveedor_id: zUuid,
  bodega_id: zUuid,
  compra_id: zUuid.nullish().transform((v) => v ?? null),
  motivo: zTexto(3, 200, "El motivo"),
  lineas: z.array(z.object({ producto_id: zUuid, cantidad: zCantidad })).min(1, "Agrega al menos un producto"),
});

/** Total de la orden (cantidad × costo por línea, redondeo por línea como Postgres). */
export function totalOrden(lineas: { cantidad: number; costo: number }[]) {
  return sumar(...lineas.map((l) => multiplicar(l.costo, l.cantidad)));
}

export type EstadoVencimiento = "al_dia" | "por_vencer" | "vencida";

/** Una cuenta vence "pronto" si faltan 7 días o menos. */
export function estadoVencimiento(vence: string, hoy: string = hoyBogota()): EstadoVencimiento {
  if (vence < hoy) return "vencida";
  const dias = Math.round((Date.parse(`${vence}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
  return dias <= 7 ? "por_vencer" : "al_dia";
}
