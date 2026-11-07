import { describe, expect, it } from "vitest";
import { proponerMapeo } from "./mapeo";

const entrada = {
  encabezados: ["Ref", "Detalle de mercancía", "Existencia", "P. Compra", "P. Público"],
  muestra: [["A1", "Cemento", "10", "28000", "32500"]],
};

describe("proponerMapeo", () => {
  it("usa el mapeo de la IA cuando es válido y completa con el heurístico", async () => {
    const r = await proponerMapeo(entrada, async () => ({
      nombre: 1, cantidad: 2, costo: 3, precio_venta: 4, sku: 0,
      codigo_barras: null, categoria: null, unidad: null, stock_minimo: null,
    }));
    expect(r.origen).toBe("ia");
    expect(r.mapeo).toMatchObject({ nombre: 1, cantidad: 2, costo: 3, precio_venta: 4, sku: 0 });
  });
  it("si la IA falla, usa los nombres de columna", async () => {
    const r = await proponerMapeo(entrada, async () => {
      throw new Error("sin API key");
    });
    expect(r.origen).toBe("heuristica");
    expect(r.mapeo.sku).toBe(0);
    expect(r.mapeo.cantidad).toBe(2);
  });
  it("si la IA devuelve basura, tampoco bloquea", async () => {
    const r = await proponerMapeo(entrada, async () => "no es un objeto");
    expect(r.origen).toBe("heuristica");
  });
  it("ignora índices fuera de rango y columnas repetidas que invente la IA", async () => {
    const r = await proponerMapeo(entrada, async () => ({ nombre: 1, precio_venta: 1, costo: 77 }));
    expect(r.mapeo.nombre).toBe(1);
    expect(r.mapeo.precio_venta).not.toBe(1);
    expect(r.mapeo.costo).not.toBe(77);
  });
});
