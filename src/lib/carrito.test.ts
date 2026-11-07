import { describe, expect, it } from "vitest";
import {
  type ProductoPOS,
  agregarAlCarrito,
  buscarPorCodigo,
  buscarPorNombre,
  cambiarLinea,
  consumoPorProducto,
  quitarLinea,
} from "./carrito";

const cemento: ProductoPOS = {
  id: "c",
  nombre: "Cemento gris 50 kg",
  unidad: "unidad",
  precio: 32500,
  codigo: "7701234567890",
  sku: "CEM-50",
  controlaStock: true,
  stock: 10,
  presentaciones: [{ id: "c-estiba", nombre: "Estiba x40", factor: 40, precio: 1200000, codigo: "7701234500001" }],
};
const alambre: ProductoPOS = { ...cemento, id: "a", nombre: "Alambre galvanizado", codigo: null, sku: null, presentaciones: [] };
const catalogo = [cemento, alambre];
let n = 0;
const clave = () => `k${++n}`;

describe("búsqueda", () => {
  it("por código de barras, SKU y código de presentación", () => {
    expect(buscarPorCodigo(catalogo, "7701234567890")?.producto.id).toBe("c");
    expect(buscarPorCodigo(catalogo, "cem-50")?.producto.id).toBe("c");
    const r = buscarPorCodigo(catalogo, " 7701234500001\n");
    expect(r?.presentacion?.id).toBe("c-estiba");
    expect(buscarPorCodigo(catalogo, "000000")).toBeNull();
  });
  it("por nombre: todas las palabras, sin tildes ni mayúsculas, en cualquier orden", () => {
    expect(buscarPorNombre(catalogo, "GRIS cemento").map((p) => p.id)).toEqual(["c"]);
    expect(buscarPorNombre(catalogo, "galvanizádo").map((p) => p.id)).toEqual(["a"]);
    expect(buscarPorNombre(catalogo, "galva").map((p) => p.id)).toEqual(["a"]);
    expect(buscarPorNombre(catalogo, "  ")).toEqual([]);
  });
});

describe("carrito", () => {
  it("suma la cantidad si el mismo producto se agrega dos veces", () => {
    let c = agregarAlCarrito([], cemento, null, 1, clave);
    c = agregarAlCarrito(c, cemento, null, 2, clave);
    expect(c).toHaveLength(1);
    expect(c[0]!.cantidad).toBe(3);
  });
  it("producto y presentación son líneas distintas, con su precio y factor", () => {
    let c = agregarAlCarrito([], cemento, null, 1, clave);
    c = agregarAlCarrito(c, cemento, cemento.presentaciones[0]!, 1, clave);
    expect(c).toHaveLength(2);
    expect(c[1]).toMatchObject({ precio: 1200000, factor: 40, presentacionId: "c-estiba" });
  });
  it("no suma sobre una línea con precio cambiado o descuento", () => {
    let c = agregarAlCarrito([], cemento, null, 1, clave);
    c = cambiarLinea(c, c[0]!.clave, { precio: 30000 });
    c = agregarAlCarrito(c, cemento, null, 1, clave);
    expect(c).toHaveLength(2);
  });
  it("evita errores de coma flotante en cantidades decimales", () => {
    let c = agregarAlCarrito([], alambre, null, 0.1, clave);
    c = agregarAlCarrito(c, alambre, null, 0.2, clave);
    expect(c[0]!.cantidad).toBe(0.3);
  });
  it("cantidad 0 elimina la línea; quitar funciona", () => {
    let c = agregarAlCarrito([], cemento, null, 1, clave);
    c = agregarAlCarrito(c, alambre, null, 1, clave);
    c = cambiarLinea(c, c[0]!.clave, { cantidad: 0 });
    expect(c.map((l) => l.productoId)).toEqual(["a"]);
    expect(quitarLinea(c, c[0]!.clave)).toEqual([]);
  });
  it("consumo en unidad base multiplica por el factor de la presentación", () => {
    let c = agregarAlCarrito([], cemento, null, 3, clave);
    c = agregarAlCarrito(c, cemento, cemento.presentaciones[0]!, 1, clave);
    expect(consumoPorProducto(c).get("c")).toBe(43);
  });
});
