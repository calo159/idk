import { type Monto, formatoCOP, multiplicar, sumar } from "@/lib/dinero";
import { normalizarTexto } from "@/lib/validaciones/ia";

export interface ProductoCatalogo {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  unidad: string;
  precio: number;
  precioAntes: number | null;
  disponible: boolean;
}

export interface LineaPedido {
  producto: ProductoCatalogo;
  cantidad: number;
}

/** Dirección sugerida a partir del nombre del negocio: «Ferretería El Puerto» → «ferreteria-el-puerto». */
export function sugerirSlug(nombre: string): string {
  return normalizarTexto(nombre)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

export const SLUG_VALIDO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Total estimado del pedido (precios del catálogo; el negocio confirma el total real). */
export function totalPedido(lineas: LineaPedido[]): Monto {
  return sumar(...lineas.map((l) => multiplicar(l.producto.precio, l.cantidad)));
}

/**
 * Mensaje que recibe el negocio. Una línea por producto con la forma «2 Cemento gris»,
 * que es justo lo que entiende el lector de pedidos de WhatsApp (flujo F6).
 */
export function textoPedido(negocio: string, lineas: LineaPedido[]): string {
  const items = lineas.filter((l) => l.cantidad > 0).map((l) => `${l.cantidad} ${l.producto.nombre}`);
  return [`Hola ${negocio}, quiero pedir:`, ...items, `(Total aproximado ${formatoCOP(totalPedido(lineas))})`].join("\n");
}

export function enlacePedidoWhatsApp(telefono: string, texto: string): string | null {
  const d = telefono.replace(/\D/g, "");
  const destino = /^3\d{9}$/.test(d) ? `57${d}` : /^573\d{9}$/.test(d) ? d : null;
  return destino ? `https://wa.me/${destino}?text=${encodeURIComponent(texto)}` : null;
}

/** Agrupa por categoría conservando el orden recibido; los sin categoría van al final como «Otros». */
export function agruparPorCategoria<T extends { categoria: string | null }>(productos: T[]): { categoria: string; productos: T[] }[] {
  const mapa = new Map<string, T[]>();
  for (const p of productos) {
    const k = p.categoria ?? "Otros";
    mapa.set(k, [...(mapa.get(k) ?? []), p]);
  }
  return [...mapa.entries()]
    .map(([categoria, productos]) => ({ categoria, productos }))
    .sort((a, b) => (a.categoria === "Otros" ? 1 : b.categoria === "Otros" ? -1 : 0));
}
