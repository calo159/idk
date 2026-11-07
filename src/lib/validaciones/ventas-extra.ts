import { z } from "zod";
import { subtotalLinea, sumar } from "@/lib/dinero";
import { zCantidad, zDia, zMonto, zTexto, zTextoOpcional, zUuid } from "./comunes";

const linea = z.object({
  producto_id: zUuid,
  presentacion_id: zUuid.nullish().transform((v) => v ?? null),
  cantidad: zCantidad,
  precio: zMonto,
  descuento: zMonto.default(0),
});

const fechaOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v))
  .pipe(zDia.optional());

export const esquemaCotizacion = z.object({
  cliente_id: zUuid.nullish().transform((v) => v ?? null),
  vigencia_hasta: fechaOpcional,
  nota: zTextoOpcional(200),
  lineas: z.array(linea).min(1, "Agrega al menos un producto").max(200),
});

const metodoSinCredito = z.enum(["efectivo", "nequi", "daviplata", "transferencia", "tarjeta", "otro"], {
  message: "Elige cómo se pagó",
});

export const esquemaSeparado = z.object({
  cliente_id: zUuid,
  bodega_id: zUuid,
  fecha_limite: fechaOpcional,
  nota: zTextoOpcional(200),
  abono_inicial: zMonto.default(0),
  metodo: metodoSinCredito.default("efectivo"),
  lineas: z.array(linea.omit({ descuento: true })).min(1, "Agrega al menos un producto").max(200),
});

export const esquemaAbonoSeparado = z.object({
  separado_id: zUuid,
  monto: zMonto.refine((v) => v > 0, "El abono debe ser mayor a cero"),
  metodo: metodoSinCredito,
});

export const esquemaEntregaSeparado = z.object({
  separado_id: zUuid,
  pagos: z.array(z.object({ metodo: metodoSinCredito, monto: zMonto })).max(6),
});

export const esquemaCancelarSeparado = z.object({ separado_id: zUuid, motivo: zTexto(3, 200, "El motivo") });

export const esquemaDevolucionCliente = z.object({
  venta_id: zUuid,
  motivo: zTexto(3, 200, "El motivo"),
  reembolso: z.enum(["efectivo", "nequi", "daviplata", "transferencia", "tarjeta", "otro", "abono_deuda"], {
    message: "Elige cómo se devuelve el dinero",
  }),
  lineas: z.array(z.object({ venta_detalle_id: zUuid, cantidad: zCantidad })).min(1, "Elige qué se devuelve"),
});

/** Total de un documento con líneas (precio × cantidad − descuento por línea). */
export function totalDocumento(lineas: { cantidad: number; precio: number; descuento?: number }[]) {
  return sumar(...lineas.map((l) => subtotalLinea(l.cantidad, l.precio, l.descuento ?? 0)));
}

/** Texto para compartir una cotización por WhatsApp. */
export function textoCotizacion(opts: {
  negocio: string;
  numero: number;
  vigencia: string;
  lineas: { nombre: string; cantidad: number; subtotal: string }[];
  total: string;
}): string {
  const items = opts.lineas.map((l) => `• ${l.cantidad} × ${l.nombre}: ${l.subtotal}`).join("\n");
  return `*${opts.negocio}* — Cotización #${opts.numero}\n${items}\n\n*Total: ${opts.total}*\nVálida hasta ${opts.vigencia}.`;
}
