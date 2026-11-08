import { z } from "zod";
import { zCantidad, zMetodoPago, zMonto, zMotivo, zOfflineId, zUuid } from "./comunes";

export const esquemaLineaVenta = z.object({
  producto_id: zUuid,
  presentacion_id: zUuid.nullish().transform((v) => v ?? null),
  cantidad: zCantidad,
  precio_unitario: zMonto,
  descuento: zMonto.default(0),
});

export const esquemaPagoVenta = z.object({
  metodo: zMetodoPago,
  monto: zMonto,
  comprobante_id: zUuid.nullish().transform((v) => v ?? null),
});

/**
 * Venta completa del POS. `offline_id` es obligatorio: lo genera el cliente y hace la operación
 * idempotente (reintentos y sincronización offline no duplican la venta).
 */
export const esquemaVenta = z.object({
  offline_id: zOfflineId,
  bodega_id: zUuid,
  cliente_id: zUuid.nullish().transform((v) => v ?? null),
  descuento: zMonto.default(0),
  lineas: z.array(esquemaLineaVenta).min(1, "Agrega al menos un producto").max(200),
  pagos: z.array(esquemaPagoVenta).min(1, "Registra el pago").max(10),
  /**
   * Momento real de la venta cuando se hizo sin internet. Solo se acepta si es de los últimos 7 días
   * y no es del futuro (tolerancia de 5 minutos por relojes desajustados).
   */
  creado_en: z.iso
    .datetime({ offset: true, message: "Fecha inválida" })
    .optional()
    .refine((v) => {
      if (!v) return true;
      const t = Date.parse(v);
      const ahora = Date.now();
      return t <= ahora + 5 * 60_000 && t >= ahora - 7 * 86_400_000;
    }, "La fecha de la venta no es válida"),
  /** Pedido de WhatsApp del que viene esta venta (se marca confirmado y se avisa al cliente). */
  pedido_id: zUuid.nullish().transform((v) => v ?? null),
  /** Cotización de la que viene esta venta (se marca como vendida). */
  cotizacion_id: zUuid.nullish().transform((v) => v ?? null),
  /** Un administrador autoriza vender por encima del cupo. */
  autorizar_exceso_cupo: z.boolean().default(false),
});
export type DatosVenta = z.infer<typeof esquemaVenta>;
export type DatosVentaEntrada = z.input<typeof esquemaVenta>;

export const esquemaAnularVenta = z.object({ venta_id: zUuid, motivo: zMotivo });
