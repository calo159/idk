export type EstadoSuscripcion = "prueba" | "activa" | "gracia" | "vencida" | "suspendida";

export const ETIQUETA_ESTADO: Record<EstadoSuscripcion, string> = {
  prueba: "En prueba",
  activa: "Activa",
  gracia: "Vencida (en gracia)",
  vencida: "Vencida",
  suspendida: "Suspendida",
};

/** Solo una suscripción vencida o suspendida bloquea las pantallas del negocio. Los datos nunca se borran. */
export const bloqueaApp = (e: EstadoSuscripcion) => e === "vencida" || e === "suspendida";

export interface Aviso {
  tipo: "info" | "alerta" | "error";
  texto: string;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Mensaje para el banner del encabezado (null = no mostrar nada). */
export function avisoSuscripcion(estado: EstadoSuscripcion, diasRestantes: number, motivo?: string | null): Aviso | null {
  switch (estado) {
    case "prueba":
      if (diasRestantes > 7) return null;
      return { tipo: diasRestantes <= 3 ? "alerta" : "info", texto: `Te ${diasRestantes === 1 ? "queda" : "quedan"} ${plural(diasRestantes, "día", "días")} de prueba gratis.` };
    case "activa":
      if (diasRestantes > 5) return null;
      return { tipo: "info", texto: `Tu suscripción vence en ${plural(diasRestantes, "día", "días")}.` };
    case "gracia":
      return { tipo: "alerta", texto: "Tu suscripción venció. Renueva en los próximos días para no perder el acceso." };
    case "vencida":
      return { tipo: "error", texto: "Tu suscripción venció. Renueva para volver a usar Surtix. Tus datos están guardados." };
    case "suspendida":
      return { tipo: "error", texto: motivo ? `Tu cuenta está suspendida: ${motivo}.` : "Tu cuenta está suspendida. Escríbenos para reactivarla." };
  }
}

export const MESES_PERMITIDOS = [1, 3, 6, 12] as const;
export type MesesPago = (typeof MESES_PERMITIDOS)[number];

/** Estados que el servidor puede devolver; cualquier otro se trata como «activa» para no bloquear a un cliente por un error nuestro. */
export function estadoSeguro(valor: unknown): EstadoSuscripcion {
  return valor === "prueba" || valor === "activa" || valor === "gracia" || valor === "vencida" || valor === "suspendida" ? valor : "activa";
}
