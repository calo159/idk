import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/tipos";
import { type ProveedorFE, type RespuestaProveedor, esquemaDocumentoFactura } from "./proveedores";

export interface ResumenProceso {
  tomadas: number;
  aceptadas: number;
  rechazadas: number;
  errores: number;
}

/**
 * Envía las facturas pendientes. Corre con el service role (solo desde el servidor): la base de datos reserva cada factura
 * (`skip locked`) para que dos procesos no envíen la misma, y registra el resultado. Una factura aceptada nunca se vuelve a tocar.
 */
export async function procesarCola(admin: SupabaseClient<Database>, proveedores: Record<string, ProveedorFE>, limite = 20): Promise<ResumenProceso> {
  const resumen: ResumenProceso = { tomadas: 0, aceptadas: 0, rechazadas: 0, errores: 0 };
  const { data, error } = await admin.rpc("facturas_pendientes_envio", { p_limite: limite });
  if (error) throw new Error("No se pudo leer la cola de facturas");
  for (const f of data ?? []) {
    resumen.tomadas++;
    let r: RespuestaProveedor;
    const proveedor = proveedores[f.proveedor];
    const doc = esquemaDocumentoFactura.safeParse(f.documento);
    if (!proveedor) r = { estado: "error", error: `El proveedor «${f.proveedor}» no está disponible`, respuesta: null };
    else if (!doc.success) r = { estado: "rechazada", error: "El documento de la factura no tiene el formato esperado", respuesta: doc.error.issues.slice(0, 3) };
    else {
      try {
        r = await proveedor.enviar(doc.data);
      } catch (e) {
        r = { estado: "error", error: e instanceof Error ? e.message : "Falla de comunicación con el proveedor", respuesta: null };
      }
    }
    // Una aceptada sin CUFE no es válida: se trata como error para que no quede «aceptada» sin comprobante.
    if (r.estado === "aceptada" && !r.cufe) r = { estado: "error", error: "El proveedor aceptó la factura pero no devolvió el CUFE", respuesta: r.respuesta };
    const { error: errRes } = await admin.rpc("resultado_factura_electronica", {
      p_id: f.id,
      p_estado: r.estado,
      p_cufe: r.cufe as string,
      p_pdf: r.pdfUrl as string,
      p_xml: r.xmlUrl as string,
      p_respuesta: (r.respuesta ?? {}) as never,
      p_error: r.error as string,
    });
    if (errRes) {
      resumen.errores++;
      continue;
    }
    if (r.estado === "aceptada") resumen.aceptadas++;
    else if (r.estado === "rechazada") resumen.rechazadas++;
    else resumen.errores++;
  }
  return resumen;
}
