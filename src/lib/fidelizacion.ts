import { formatoCOP } from "@/lib/dinero";

export type TipoContacto = "cumpleanos" | "inactivo";

const primerNombre = (n: string) => n.trim().split(/\s+/)[0] ?? "";

/** Saludo de cumpleaños: cálido, con el regalo de puntos solo si el negocio lo da. */
export function mensajeCumpleanos(cliente: string, negocio: string, puntosBono: number, valorPunto: number): string {
  const regalo = puntosBono > 0 ? ` Te regalamos *${puntosBono} puntos* (valen ${formatoCOP(puntosBono * valorPunto)}) para tu próxima compra.` : "";
  return `🎂 ¡Feliz cumpleaños, ${primerNombre(cliente)}! Te saludamos de *${negocio}*.${regalo} ¡Que lo disfrutes!`;
}

/** "Te extrañamos": sin presión ni promesas que el negocio no haya configurado. */
export function mensajeInactivo(cliente: string, negocio: string, dias: number, puntos: number, valorPunto: number): string {
  const saldo = puntos > 0 && valorPunto > 0 ? ` Tienes *${puntos} puntos* (${formatoCOP(puntos * valorPunto)}) esperándote.` : "";
  return `Hola ${primerNombre(cliente)} 👋, de *${negocio}*. Hace ${dias} días no te vemos y queremos saber cómo estás.${saldo} ¡Aquí te esperamos!`;
}

export const ETIQUETA_CONTACTO: Record<TipoContacto, string> = { cumpleanos: "Cumpleaños hoy", inactivo: "Hace tiempo no compra" };
