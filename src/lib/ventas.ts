import { type Monto, type Valor, dinero, porcentaje, restar, subtotalLinea, sumar, vuelto } from "@/lib/dinero";

/** Cálculos de una venta. Un solo lugar, igual que SQL (round por línea, luego suma). */

export interface LineaCalculo {
  cantidad: Valor;
  precio_unitario: Valor;
  descuento?: Valor;
}

export interface PagoCalculo {
  metodo: string;
  monto: Valor;
}

export function subtotalVenta(lineas: LineaCalculo[]): Monto {
  return sumar(...lineas.map((l) => subtotalLinea(l.cantidad, l.precio_unitario, l.descuento ?? 0)));
}

/** total = Σ subtotales de línea − descuento global (nunca negativo). */
export function totalVenta(lineas: LineaCalculo[], descuentoGlobal: Valor = 0): Monto {
  const t = restar(subtotalVenta(lineas), descuentoGlobal);
  return t.isNegative() ? dinero(0) : t;
}

export interface ResumenPagos {
  /** Lo que el cliente entregó en total (incluye el efectivo que se devuelve). */
  recibido: Monto;
  /** Lo que se registra como pagado (recibido menos el vuelto). */
  aplicado: Monto;
  /** Falta por cobrar. */
  faltante: Monto;
  /** Vuelto en efectivo. */
  vuelto: Monto;
  /** Pagos tal como se guardan en la BD (el efectivo ya descuenta el vuelto). */
  pagosParaBd: { metodo: string; monto: Monto }[];
}

/**
 * Reparte lo recibido contra el total. El vuelto solo puede salir del efectivo:
 * si se pagó de más con otro medio, no hay vuelto y queda como "exceso" (faltante negativo = inválido).
 */
export function resumirPagos(total: Valor, pagos: PagoCalculo[]): ResumenPagos {
  const t = dinero(total);
  const validos = pagos.filter((p) => dinero(p.monto).gt(0));
  const recibido = sumar(...validos.map((p) => p.monto));
  const efectivo = sumar(...validos.filter((p) => p.metodo === "efectivo").map((p) => p.monto));

  // El exceso solo se devuelve si cabe dentro del efectivo recibido.
  const exceso = restar(recibido, t);
  const v = exceso.gt(0) && efectivo.gte(exceso) ? vuelto(recibido, t) : dinero(0);
  const aplicado = restar(recibido, v);

  const pagosParaBd = validos.map((p) => ({
    metodo: p.metodo,
    monto: p.metodo === "efectivo" ? restar(p.monto, v) : dinero(p.monto),
  }));
  // Con vuelto, todo el exceso sale del efectivo; si quedara en 0 se descarta la línea.
  const finales = pagosParaBd.filter((p) => p.monto.gt(0));
  return { recibido, aplicado, faltante: restar(t, aplicado), vuelto: v, pagosParaBd: finales };
}

/** Descuento sobre una línea: porcentaje → monto. */
export function descuentoPorPorcentaje(cantidad: Valor, precio: Valor, pct: Valor): Monto {
  return porcentaje(subtotalLinea(cantidad, precio, 0), pct);
}
