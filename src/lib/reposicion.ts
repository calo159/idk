import { formatoCOP } from "@/lib/dinero";

export interface LineaReposicion {
  producto: string;
  sugerida: number;
  unidad: string;
  dias: number | null;
}

/** Mensaje semanal de reposición para el dueño. Corto: lo urgente primero, el resto en la app. */
export function mensajeReposicion(negocio: string, criticos: number, total: number, valor: number, top: LineaReposicion[]): string | null {
  if (total === 0) return null;
  const lineas = [`📦 *${negocio}* — reposición de la semana`];
  lineas.push(
    criticos > 0
      ? `🔴 ${criticos} producto(s) se te acaban antes de que llegue un pedido nuevo.`
      : `Hay ${total} producto(s) para reponer pronto.`,
  );
  for (const t of top.slice(0, 6)) {
    const cuando = t.dias === null ? "" : t.dias < 1 ? " (se acaba hoy)" : ` (alcanza ${Math.round(t.dias)} día(s))`;
    lineas.push(`• ${t.producto}: comprar ${t.sugerida} ${t.unidad}${cuando}`);
  }
  if (total > 6) lineas.push(`…y ${total - 6} más.`);
  lineas.push(`Inversión estimada: ${formatoCOP(valor)}.`);
  lineas.push("Entra a Compras → Sugerencias para crear las órdenes con un toque.");
  return lineas.join("\n");
}

/** Agrupa las líneas elegidas por proveedor para crear una orden de compra por cada uno. */
export function agruparPorProveedor<T extends { proveedor_id: string | null }>(items: T[]): { proveedor_id: string | null; items: T[] }[] {
  const mapa = new Map<string | null, T[]>();
  for (const it of items) mapa.set(it.proveedor_id, [...(mapa.get(it.proveedor_id) ?? []), it]);
  return [...mapa].map(([proveedor_id, items]) => ({ proveedor_id, items })).sort((a, b) => (a.proveedor_id === null ? 1 : 0) - (b.proveedor_id === null ? 1 : 0));
}
