import { formatoCOP } from "@/lib/dinero";

/**
 * Texto de WhatsApp para cada evento del outbox. Devuelve `null` si el evento no merece un aviso
 * (n8n igual lo marca como procesado). Mensajes cortos, en español de Colombia y sin acusar a nadie.
 */

type Payload = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
const texto = (v: unknown, max = 160) => String(v ?? "").replace(/[\r\n]+/g, " ").slice(0, max);

const ICONO_SEVERIDAD: Record<string, string> = { alta: "🔴", media: "🟠", baja: "🟡" };

export function mensajeDeEvento(tipo: string, payload: Payload, negocio: string): string | null {
  const cabecera = `*${negocio}*`;
  switch (tipo) {
    case "alerta.creada":
      return `${ICONO_SEVERIDAD[texto(payload.severidad)] ?? "🔔"} ${cabecera}\n${texto(payload.mensaje, 300)}`;
    case "venta.anulada":
      return `🔴 ${cabecera}\nSe anuló la venta #${texto(payload.numero)} por ${formatoCOP(num(payload.total) || 0)}.\nMotivo: ${texto(payload.motivo)}`;
    case "caja.cerrada": {
      const dif = num(payload.diferencia);
      if (!Number.isFinite(dif) || dif === 0) return null; // caja cuadrada: va en el resumen del día
      return `${dif < 0 ? "🔴" : "🟠"} ${cabecera}\nCierre de caja con ${dif < 0 ? "faltante" : "sobrante"} de ${formatoCOP(Math.abs(dif))}.`;
    }
    case "ajuste.grande":
      return `🟠 ${cabecera}\nAjuste grande de inventario por ${formatoCOP(num(payload.valor) || 0)}.\nMotivo: ${texto(payload.motivo)}`;
    case "stock.bajo":
      return `🟡 ${cabecera}\nUn producto llegó a su stock mínimo. Revisa Inventario → Por reponer.`;
    case "stock.negativo":
      return `🟠 ${cabecera}\nHay un producto con stock negativo: se vendió más de lo que había registrado. Revisa Inventario.`;
    case "pedido.nuevo": {
      const sin = num(payload.sin_emparejar) || 0;
      return `🛒 ${cabecera}\nLlegó un pedido por WhatsApp (${num(payload.productos) || 0} producto(s)${sin ? `, ${sin} por confirmar` : ""}). Revísalo en Ventas → Pedidos.`;
    }
    case "pedido.confirmado":
      return `Tu pedido en *${negocio}* está listo ✅\nTotal: *${formatoCOP(num(payload.total) || 0)}* (venta #${texto(payload.numero)}). ¡Gracias por tu compra!`;
    case "pedido.rechazado":
      return `Hola, de *${negocio}*. No pudimos atender tu pedido: ${texto(payload.motivo)}. Escríbenos si quieres ajustarlo.`;
    case "compra.anulada":
      return null;
    default:
      return null;
  }
}

/** Normaliza un celular colombiano al formato que pide WhatsApp Cloud API (57 + 10 dígitos). */
export function destinoWhatsApp(telefono: string | null | undefined): string | null {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (/^3\d{9}$/.test(d)) return `57${d}`;
  if (/^573\d{9}$/.test(d)) return d;
  return null;
}
