import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { dinero } from "@/lib/dinero";

/**
 * Integración con Wompi (cobro en línea en Colombia). Solo funciones puras: la firma de integridad del checkout y la
 * verificación del evento del webhook. Basado en la documentación pública de Wompi; NO se ha probado contra su sandbox
 * (hace falta una cuenta con llaves de prueba).
 */

export const MONEDA = "COP";

/** Pesos → centavos enteros (Wompi siempre trabaja en centavos). Sin pasar por números flotantes. */
export function aCentavos(pesos: number | string): number {
  return dinero(pesos).times(100).toDecimalPlaces(0).toNumber();
}

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

/** Firma que Wompi exige en el checkout: SHA-256 de «referencia + centavos + moneda + secreto de integridad». */
export function firmaIntegridad(referencia: string, centavos: number, secreto: string, moneda = MONEDA): string {
  return sha256(`${referencia}${centavos}${moneda}${secreto}`);
}

export function urlCheckout(p: { llavePublica: string; referencia: string; centavos: number; secretoIntegridad: string; urlRetorno: string }): string {
  const q = new URLSearchParams({
    "public-key": p.llavePublica,
    currency: MONEDA,
    "amount-in-cents": String(p.centavos),
    reference: p.referencia,
    "signature:integrity": firmaIntegridad(p.referencia, p.centavos, p.secretoIntegridad),
    "redirect-url": p.urlRetorno,
  });
  return `https://checkout.wompi.co/p/?${q.toString()}`;
}

const esquemaEvento = z.object({
  event: z.string(),
  data: z.record(z.string(), z.unknown()),
  timestamp: z.number(),
  signature: z.object({ properties: z.array(z.string()).min(1).max(20), checksum: z.string().min(8) }),
});

export type EventoWompi = z.infer<typeof esquemaEvento>;

/** Lee «transaction.status» de un objeto anidado. */
function leer(obj: unknown, ruta: string): string {
  let actual: unknown = obj;
  for (const k of ruta.split(".")) {
    if (typeof actual !== "object" || actual === null) return "";
    actual = (actual as Record<string, unknown>)[k];
  }
  return actual === undefined || actual === null ? "" : String(actual);
}

/**
 * Verifica que el evento lo envió Wompi: checksum = SHA-256 de los valores de `signature.properties` (en ese orden),
 * seguidos del `timestamp` y del secreto de eventos. Comparación de tiempo constante.
 */
export function verificarEvento(cuerpo: unknown, secretoEventos: string): { valido: true; evento: EventoWompi } | { valido: false; motivo: string } {
  const e = esquemaEvento.safeParse(cuerpo);
  if (!e.success) return { valido: false, motivo: "formato" };
  const base = e.data.signature.properties.map((p) => leer(e.data.data, p)).join("") + String(e.data.timestamp) + secretoEventos;
  const esperado = Buffer.from(sha256(base), "utf8");
  const recibido = Buffer.from(e.data.signature.checksum.toLowerCase(), "utf8");
  if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) return { valido: false, motivo: "checksum" };
  return { valido: true, evento: e.data };
}

export interface TransaccionWompi {
  id: string;
  referencia: string;
  /** Estado propio: solo APPROVED cuenta como pagado. */
  estado: "aprobado" | "rechazado" | "pendiente";
  centavos: number;
}

/** Extrae la transacción de un evento `transaction.updated` ya verificado. */
export function leerTransaccion(evento: EventoWompi): TransaccionWompi | null {
  if (evento.event !== "transaction.updated") return null;
  const t = (evento.data as { transaction?: Record<string, unknown> }).transaction;
  if (!t) return null;
  const id = leer(t, "id");
  const referencia = leer(t, "reference");
  const centavos = Number(leer(t, "amount_in_cents"));
  if (!id || !referencia || !Number.isInteger(centavos) || centavos < 0) return null;
  const status = leer(t, "status");
  return { id, referencia, centavos, estado: status === "APPROVED" ? "aprobado" : status === "PENDING" ? "pendiente" : "rechazado" };
}
