import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Firma HMAC-SHA256 entre n8n y Surtix (docs/04-AUTOMATIZACIONES-N8N.md).
 * Se firma `"{fecha}.{cuerpo}"` y la fecha viaja en `x-surtix-fecha` (milisegundos Unix): un mensaje capturado
 * no se puede repetir pasada la ventana de tolerancia.
 */

export const TOLERANCIA_MS = 5 * 60_000;

export function firmar(cuerpo: string, secreto: string, fecha: number = Date.now()): { firma: string; fecha: string } {
  const f = String(fecha);
  return { fecha: f, firma: createHmac("sha256", secreto).update(`${f}.${cuerpo}`).digest("hex") };
}

/** Comparación en tiempo constante (no revela cuántos caracteres coinciden). */
export function igualesSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // Se compara igual contra sí mismo para gastar un tiempo parecido.
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export type ResultadoFirma = { valida: true } | { valida: false; motivo: "faltan_encabezados" | "fecha_invalida" | "expirada" | "firma_incorrecta" };

export function verificarFirma(
  cuerpo: string,
  firma: string | null | undefined,
  fecha: string | null | undefined,
  secreto: string,
  ahora: number = Date.now(),
): ResultadoFirma {
  if (!firma || !fecha) return { valida: false, motivo: "faltan_encabezados" };
  if (!/^\d{10,16}$/.test(fecha)) return { valida: false, motivo: "fecha_invalida" };
  if (Math.abs(ahora - Number(fecha)) > TOLERANCIA_MS) return { valida: false, motivo: "expirada" };
  const esperada = firmar(cuerpo, secreto, Number(fecha)).firma;
  return igualesSeguro(firma.toLowerCase(), esperada) ? { valida: true } : { valida: false, motivo: "firma_incorrecta" };
}

/** Extrae el token de `Authorization: Bearer …` y lo compara en tiempo constante. */
export function tokenValido(encabezado: string | null | undefined, esperado: string | undefined): boolean {
  if (!encabezado || !esperado) return false;
  const m = /^Bearer\s+(.+)$/i.exec(encabezado.trim());
  return !!m && igualesSeguro(m[1]!, esperado);
}
