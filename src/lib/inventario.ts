import { type Valor, cantidad, dinero, multiplicar, sumar } from "@/lib/dinero";

export type EstadoStock = "agotado" | "bajo" | "ok" | "sin_control";

/** Agotado (≤ 0), bajo (≤ mínimo, con mínimo > 0) u ok. */
export function estadoStock(actual: Valor, minimo: Valor, manejaInventario = true): EstadoStock {
  if (!manejaInventario) return "sin_control";
  const a = cantidad(actual);
  if (a.lte(0)) return "agotado";
  const m = cantidad(minimo);
  if (m.gt(0) && a.lte(m)) return "bajo";
  return "ok";
}

/** Valor del inventario = Σ cantidad × costo promedio (solo cantidades positivas). */
export function valorInventario(filas: { cantidad: Valor; costo_promedio: Valor }[]) {
  return sumar(
    ...filas.map((f) =>
      cantidad(f.cantidad).gt(0) ? multiplicar(f.cantidad, f.costo_promedio) : dinero(0),
    ),
  );
}

/** Conteo físico: diferencia a ajustar = contado − sistema (positiva = sobrante). */
export function diferenciaConteo(contado: Valor, sistema: Valor) {
  return cantidad(contado).minus(cantidad(sistema));
}

export const ETIQUETA_MOVIMIENTO: Record<string, string> = {
  inicial: "Inventario inicial",
  compra: "Compra",
  venta: "Venta",
  ajuste_entrada: "Ajuste (+)",
  ajuste_salida: "Ajuste (−)",
  traslado_entrada: "Traslado (entra)",
  traslado_salida: "Traslado (sale)",
  devolucion_cliente: "Devolución de cliente",
  devolucion_proveedor: "Devolución a proveedor",
  anulacion_entrada: "Anulación (entra)",
  anulacion_salida: "Anulación (sale)",
};
