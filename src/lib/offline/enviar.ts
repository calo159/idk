import { cobrarVenta } from "@/app/(app)/ventas/pos/acciones";
import { registrarVisita } from "@/app/(app)/ventas/ruta/acciones";
import type { RespuestaEnvio } from "./cola";

/**
 * Envía una venta de la cola con la misma Server Action del POS (idempotente por offline_id).
 * Una respuesta del servidor —aunque sea negativa— NO es falta de conexión: la venta se marca rechazada.
 * Solo una excepción de red (fetch falló) se trata como "sin conexión" y se reintenta después.
 */
export async function enviarVentaOffline(payload: Record<string, unknown>): Promise<RespuestaEnvio> {
  try {
    const r = await cobrarVenta(payload);
    return r.ok ? { tipo: "ok" } : { tipo: "rechazada", mensaje: r.error };
  } catch {
    return { tipo: "sin_conexion" };
  }
}

/** Igual que las ventas, pero para visitas de ruta. */
export async function enviarVisitaOffline(payload: Record<string, unknown>): Promise<RespuestaEnvio> {
  try {
    const r = await registrarVisita(payload);
    return r.ok ? { tipo: "ok" } : { tipo: "rechazada", mensaje: r.error };
  } catch {
    return { tipo: "sin_conexion" };
  }
}
