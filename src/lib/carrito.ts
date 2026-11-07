import { variantesCodigo } from "@/lib/codigos";
import { normalizarTexto } from "@/lib/validaciones/ia";

/** Carrito del POS: funciones puras (se prueban sin interfaz). */

export interface PresentacionPOS {
  id: string;
  nombre: string;
  factor: number;
  precio: number;
  codigo: string | null;
}

export interface ProductoPOS {
  id: string;
  nombre: string;
  unidad: string;
  precio: number;
  codigo: string | null;
  sku: string | null;
  controlaStock: boolean;
  /** Existencia en la bodega del turno, en unidad base. */
  stock: number;
  presentaciones: PresentacionPOS[];
}

export interface LineaCarrito {
  clave: string;
  productoId: string;
  presentacionId: string | null;
  nombre: string;
  /** Cantidad en la unidad que se vende (de la presentación si hay). */
  cantidad: number;
  precio: number;
  /** Precio de catálogo, para detectar cambios de precio. */
  precioCatalogo: number;
  descuento: number;
  factor: number;
}

/** Busca por código de barras / SKU exacto (lector USB, cámara). Devuelve producto y presentación. */
export function buscarPorCodigo(
  catalogo: ProductoPOS[],
  codigo: string,
): { producto: ProductoPOS; presentacion: PresentacionPOS | null } | null {
  const vs = variantesCodigo(codigo).map((v) => v.toLowerCase());
  for (const p of catalogo) {
    if ((p.codigo && vs.includes(p.codigo.toLowerCase())) || (p.sku && vs.includes(p.sku.toLowerCase())))
      return { producto: p, presentacion: null };
    const pr = p.presentaciones.find((x) => x.codigo && vs.includes(x.codigo.toLowerCase()));
    if (pr) return { producto: p, presentacion: pr };
  }
  return null;
}

/** Búsqueda por nombre: todas las palabras escritas deben aparecer (sin tildes ni mayúsculas). */
export function buscarPorNombre(catalogo: ProductoPOS[], texto: string, limite = 8): ProductoPOS[] {
  const palabras = normalizarTexto(texto).split(" ").filter(Boolean);
  if (!palabras.length) return [];
  return catalogo
    .filter((p) => {
      const n = normalizarTexto(p.nombre);
      return palabras.every((w) => n.includes(w));
    })
    .slice(0, limite);
}

/** Agrega un producto: si ya está (misma presentación y precio de catálogo) suma la cantidad. */
export function agregarAlCarrito(
  carrito: LineaCarrito[],
  producto: ProductoPOS,
  presentacion: PresentacionPOS | null,
  cantidad = 1,
  nuevaClave: () => string = () => crypto.randomUUID(),
): LineaCarrito[] {
  const presentacionId = presentacion?.id ?? null;
  const precio = presentacion?.precio ?? producto.precio;
  const i = carrito.findIndex(
    (l) => l.productoId === producto.id && l.presentacionId === presentacionId && l.precio === precio && l.descuento === 0,
  );
  if (i >= 0) return carrito.map((l, j) => (j === i ? { ...l, cantidad: redondear3(l.cantidad + cantidad) } : l));
  return [
    ...carrito,
    {
      clave: nuevaClave(),
      productoId: producto.id,
      presentacionId,
      nombre: presentacion ? `${producto.nombre} · ${presentacion.nombre}` : producto.nombre,
      cantidad,
      precio,
      precioCatalogo: precio,
      descuento: 0,
      factor: presentacion?.factor ?? 1,
    },
  ];
}

export function cambiarLinea(
  carrito: LineaCarrito[],
  clave: string,
  cambio: Partial<Pick<LineaCarrito, "cantidad" | "precio" | "descuento">>,
): LineaCarrito[] {
  return carrito
    .map((l) => (l.clave === clave ? { ...l, ...cambio } : l))
    .filter((l) => l.cantidad > 0);
}

export function quitarLinea(carrito: LineaCarrito[], clave: string): LineaCarrito[] {
  return carrito.filter((l) => l.clave !== clave);
}

/** Unidades base que consume el carrito de un producto (para avisar si supera el stock). */
export function consumoPorProducto(carrito: LineaCarrito[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of carrito)
    m.set(l.productoId, redondear3((m.get(l.productoId) ?? 0) + l.cantidad * l.factor));
  return m;
}

export const redondear3 = (n: number) => Math.round(n * 1000) / 1000;
