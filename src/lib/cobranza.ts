import { formatoCOP } from "@/lib/dinero";
import { partesBogota } from "@/lib/fechas";

export type NivelRecordatorio = 1 | 2 | 3;

/** Mensajes de cobro: amables al inicio, más claros después, siempre respetuosos y sin amenazas. */
export function mensajeRecordatorio(nivel: NivelRecordatorio, cliente: string, negocio: string, saldo: number, diasMora: number): string {
  const nombre = cliente.trim().split(/\s+/)[0] ?? "";
  const valor = formatoCOP(saldo);
  switch (nivel) {
    case 1:
      return `Hola ${nombre} 👋, te escribimos de *${negocio}*. Te recordamos con cariño que tienes un saldo pendiente de *${valor}*. Cuando puedas pasar o transferir, nos ayudas mucho. ¡Gracias!`;
    case 2:
      return `Hola ${nombre}, de *${negocio}*. Tu saldo de *${valor}* lleva ${diasMora} días vencido. ¿Podemos acordar una fecha de pago o un abono esta semana? Estamos para ayudarte.`;
    case 3:
      return `Hola ${nombre}, de *${negocio}*. Tu saldo de *${valor}* lleva ${diasMora} días de atraso. Queremos seguir atendiéndote con crédito; por favor comunícate con nosotros para ponernos de acuerdo en el pago.`;
  }
}

/** Solo se escribe a clientes entre las 8:00 a. m. y las 7:00 p. m. (hora de Bogotá), de lunes a sábado. */
export function dentroDeHorarioDeCobro(ahora: Date = new Date()): boolean {
  const p = partesBogota(ahora);
  const dow = new Date(Date.UTC(p.anio, p.mes - 1, p.dia)).getUTCDay();
  return dow !== 0 && p.hora >= 8 && p.hora < 19;
}

export const ETIQUETA_CATEGORIA: Record<string, string> = { bueno: "Paga bien", regular: "Regular", malo: "No fiar más" };
