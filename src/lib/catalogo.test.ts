import { describe, expect, it } from "vitest";
import { extraerItemsReglas } from "@/server/pedidos/extraer";
import { type ProductoCatalogo, agruparPorCategoria, enlacePedidoWhatsApp, sugerirSlug, textoPedido, totalPedido } from "./catalogo";

const p = (nombre: string, precio: number, categoria: string | null = null): ProductoCatalogo => ({ id: nombre, nombre, descripcion: null, categoria, unidad: "unidad", precio, precioAntes: null, disponible: true });

describe("sugerirSlug", () => {
  it("quita tildes, símbolos y espacios", () => {
    expect(sugerirSlug("Ferretería El Puerto")).toBe("ferreteria-el-puerto");
    expect(sugerirSlug("  ¡Mi   Tienda & Cía.! ")).toBe("mi-tienda-cia");
  });
  it("máximo 40 caracteres y sin guion al final", () => {
    const s = sugerirSlug("Distribuidora de materiales de construcción y ferretería del norte");
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("pedido por WhatsApp", () => {
  const lineas = [{ producto: p("Cemento gris 50 kg", 34000), cantidad: 2 }, { producto: p("Arena de río", 6000), cantidad: 3 }];
  it("suma con precisión decimal", () => {
    expect(totalPedido([{ producto: p("A", 0.1), cantidad: 3 }]).toString()).toBe("0.3");
    expect(totalPedido(lineas).toNumber()).toBe(86000);
  });
  it("texto: una línea por producto y el total aproximado", () => {
    const t = textoPedido("Ferretería El Puerto", lineas);
    expect(t).toContain("Hola Ferretería El Puerto, quiero pedir:");
    expect(t).toContain("2 Cemento gris 50 kg");
    expect(t).toContain("3 Arena de río");
    expect(t).toContain("$ 86.000");
  });
  it("ignora líneas con cantidad cero", () => {
    expect(textoPedido("N", [{ producto: p("X", 100), cantidad: 0 }])).not.toContain("0 X");
  });
  it("el lector de pedidos del bot (F6) entiende exactamente lo que genera el catálogo", () => {
    const items = extraerItemsReglas(textoPedido("Ferretería El Puerto", lineas));
    expect(items.map((i) => [i.cantidad, i.descripcion.toLowerCase()])).toEqual([
      [2, expect.stringContaining("cemento gris")],
      [3, expect.stringContaining("arena")],
    ]);
  });
  it("enlace de WhatsApp: acepta celular colombiano y rechaza lo demás", () => {
    expect(enlacePedidoWhatsApp("311 222 3344", "hola")).toBe("https://wa.me/573112223344?text=hola");
    expect(enlacePedidoWhatsApp("573112223344", "a b")).toBe("https://wa.me/573112223344?text=a%20b");
    expect(enlacePedidoWhatsApp("12345", "x")).toBeNull();
  });
});

describe("agruparPorCategoria", () => {
  it("agrupa en orden y deja «Otros» al final", () => {
    const g = agruparPorCategoria([p("a", 1), p("b", 1, "Cemento"), p("c", 1, "Pinturas"), p("d", 1, "Cemento")]);
    expect(g.map((x) => x.categoria)).toEqual(["Cemento", "Pinturas", "Otros"]);
    expect(g[0]!.productos.map((x) => x.nombre)).toEqual(["b", "d"]);
  });
});
