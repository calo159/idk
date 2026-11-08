import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Contrato con el proveedor tecnológico autorizado por la DIAN (Factus, Alegra, Siigo…).
 * Para facturar DE VERDAD hay que escribir un adaptador que cumpla `ProveedorFE` con el contrato real del proveedor elegido
 * y registrarlo en `PROVEEDORES`. Hoy solo existe `simulado`, que NO tiene validez fiscal.
 */

const numero = z.coerce.number();

/** Forma del documento que arma la base de datos (`construir_documento_factura`). Se valida antes de enviarlo. */
export const esquemaDocumentoFactura = z.object({
  tipo: z.literal("factura_venta"),
  ambiente: z.enum(["pruebas", "produccion"]),
  venta_id: z.string(),
  emisor: z.object({ nit: z.string(), dv: z.string().nullable(), razon_social: z.string(), prefijo: z.string(), resolucion: z.string().nullable(), rango_desde: numero, rango_hasta: numero }),
  numero: numero,
  numero_completo: z.string(),
  fecha: z.string(),
  receptor: z.object({ tipo_documento: z.string(), documento: z.string(), nombre: z.string() }),
  lineas: z.array(z.object({
    codigo: z.string(), descripcion: z.string(), unidad: z.string(), cantidad: numero, precio_unitario: numero,
    descuento_linea: numero, descuento_general: numero, base: numero, iva_pct: numero, iva: numero, total: numero,
  })).min(1),
  totales: z.object({ base: numero, iva: numero, descuento_general: numero, total: numero, por_tarifa: z.record(z.string(), z.object({ base: numero, iva: numero })) }),
  forma_pago: z.enum(["contado", "credito"]),
  pagos: z.array(z.object({ metodo: z.string(), monto: numero })),
});
export type DocumentoFactura = z.infer<typeof esquemaDocumentoFactura>;

export interface RespuestaProveedor {
  estado: "aceptada" | "rechazada" | "error";
  cufe?: string;
  pdfUrl?: string;
  xmlUrl?: string;
  /** Detalle legible cuando no se aceptó. */
  error?: string;
  /** Respuesta cruda del proveedor, para auditoría. */
  respuesta: unknown;
}

export interface ProveedorFE {
  nombre: string;
  /** `rechazada` = el documento tiene un problema que alguien debe corregir. `error` = falla transitoria, se reintenta. */
  enviar(doc: DocumentoFactura): Promise<RespuestaProveedor>;
}

/**
 * Proveedor de PRUEBA: acepta todo con un CUFE falso y rechaza si el documento del adquirente empieza por «0000»
 * (para poder probar el camino de rechazo). Sin validez fiscal.
 */
export const proveedorSimulado: ProveedorFE = {
  nombre: "simulado",
  async enviar(doc) {
    if (doc.ambiente === "produccion") return { estado: "rechazada", error: "El proveedor simulado no puede facturar en producción", respuesta: { simulado: true } };
    if (doc.receptor.documento.startsWith("0000")) {
      return { estado: "rechazada", error: "Documento del adquirente inválido (simulado)", respuesta: { simulado: true, codigo: "SIM-ADQ" } };
    }
    const huella = createHash("sha256").update(`${doc.emisor.nit}|${doc.numero_completo}|${doc.fecha}|${doc.totales.total}`).digest("hex").slice(0, 40);
    return { estado: "aceptada", cufe: `SIMULADO-${huella}`, respuesta: { simulado: true, aviso: "Sin validez fiscal" } };
  },
};

export const PROVEEDORES: Record<string, ProveedorFE> = { simulado: proveedorSimulado };
