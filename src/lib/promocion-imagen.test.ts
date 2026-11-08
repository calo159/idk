import { describe, expect, it } from "vitest";
import { type Lienzo, dibujarAfiche, partirEnRenglones, porcentajeAhorro, textoPromocionWhatsApp } from "./promocion-imagen";

const datos = {
  negocio: "Ferretería El Puerto",
  nombre: "Liquidación de fin de mes",
  hasta: "2026-11-30",
  items: [
    { nombre: "Lámpara colgante", precioNormal: 50000, precioPromo: 40000 },
    { nombre: "Adorno de pared", precioNormal: 10000, precioPromo: 7000 },
  ],
};

describe("porcentajeAhorro y texto de WhatsApp", () => {
  it("calcula el % de ahorro redondeado y tolera precio normal cero", () => {
    expect(porcentajeAhorro(50000, 40000)).toBe(20);
    expect(porcentajeAhorro(10000, 7000)).toBe(30);
    expect(porcentajeAhorro(0, 100)).toBe(0);
  });
  it("arma el mensaje con tachado, precios, vigencia y recorta a 12 productos", () => {
    const t = textoPromocionWhatsApp(datos);
    expect(t).toContain("🔥 *Liquidación de fin de mes* — Ferretería El Puerto");
    expect(t).toContain("• Lámpara colgante: ~$ 50.000~ *$ 40.000* (-20 %)");
    expect(t).toContain("Hasta el");
    const muchos = textoPromocionWhatsApp({ ...datos, items: Array.from({ length: 15 }, (_, i) => ({ nombre: `P${i}`, precioNormal: 100, precioPromo: 90 })) });
    expect(muchos).toContain("…y 3 más");
  });
});

describe("partirEnRenglones", () => {
  const medir = (t: string) => t.length * 10;
  it("parte por palabras sin pasarse del ancho", () => {
    expect(partirEnRenglones("uno dos tres cuatro", 80, medir, 3)).toEqual(["uno dos", "tres", "cuatro"]);
  });
  it("una palabra más larga que el ancho va sola (no se pierde)", () => {
    expect(partirEnRenglones("supercalifragilistico", 50, medir)).toEqual(["supercalifragilistico"]);
  });
  it("si sobran renglones, el último termina en puntos suspensivos", () => {
    const r = partirEnRenglones("a b c d e f g h", 20, medir, 2);
    expect(r).toHaveLength(2);
    expect(r[1]!.endsWith("…")).toBe(true);
  });
  it("texto vacío no produce renglones", () => {
    expect(partirEnRenglones("   ", 100, medir)).toEqual([]);
  });
});

describe("dibujarAfiche", () => {
  function lienzoFalso() {
    const textos: string[] = [];
    const c: Lienzo = {
      fillStyle: "", font: "", textAlign: "left",
      fillRect: () => undefined,
      fillText: (t) => void textos.push(t),
      measureText: (t) => ({ width: t.length * 20 }),
    };
    return { c, textos };
  }
  it("escribe el título en mayúsculas, el negocio, los precios y la vigencia", () => {
    const { c, textos } = lienzoFalso();
    dibujarAfiche(c, datos);
    const todo = textos.join(" | ");
    expect(todo).toContain("LIQUIDACIÓN");
    expect(todo).toContain("Ferretería El Puerto");
    expect(todo).toContain("$ 40.000");
    expect(todo).toContain("-30 %");
    expect(todo).toContain("Hasta el");
  });
  it("destaca primero los mayores descuentos y no pasa de 5 productos", () => {
    const { c, textos } = lienzoFalso();
    const items = Array.from({ length: 8 }, (_, i) => ({ nombre: `Producto ${i}`, precioNormal: 10000, precioPromo: 10000 - (i + 1) * 500 }));
    dibujarAfiche(c, { ...datos, items });
    const nombres = textos.filter((t) => t.startsWith("Producto"));
    expect(nombres).toHaveLength(5);
    expect(nombres[0]).toBe("Producto 7"); // el de mayor descuento primero
  });
  it("funciona sin productos", () => {
    const { c } = lienzoFalso();
    expect(() => dibujarAfiche(c, { ...datos, items: [] })).not.toThrow();
  });
});
