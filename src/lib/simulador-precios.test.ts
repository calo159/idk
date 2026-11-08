import { describe, expect, it } from "vitest";
import { ajustarPrecio, simularPrecios } from "./simulador-precios";

const item = { costo: 6000, precioActual: 10000, precioNuevo: 11000, unidades30d: 100 };

describe("simularPrecios", () => {
  it("sin elasticidad: la venta no cambia y toda la subida es utilidad", () => {
    const r = simularPrecios([item]);
    expect(r).toMatchObject({ ingresoActual: 1_000_000, ingresoNuevo: 1_100_000, utilidadActual: 400_000, utilidadNueva: 500_000, diferenciaUtilidad: 100_000 });
    expect(r.margenActual).toBe(40);
    expect(r.margenNuevo).toBe(45.5);
  });
  it("con elasticidad −1: subir 10 % vende 10 % menos; igual puede convenir", () => {
    const r = simularPrecios([item], -1);
    // 90 unidades × (11.000 − 6.000) = 450.000 vs 400.000
    expect(r.utilidadNueva).toBe(450_000);
    expect(r.ingresoNuevo).toBe(990_000);
  });
  it("con elasticidad muy alta, subir el precio puede bajar la utilidad", () => {
    const r = simularPrecios([item], -3); // 10 % arriba → 30 % menos venta: 70 × 5.000 = 350.000
    expect(r.diferenciaUtilidad).toBe(-50_000);
  });
  it("bajar el precio con elasticidad negativa sube la venta (con tope de ×2)", () => {
    const r = simularPrecios([{ ...item, precioNuevo: 9000 }], -2); // −10 % → +20 % ventas: 120 × 3.000 = 360.000
    expect(r.utilidadNueva).toBe(360_000);
    const tope = simularPrecios([{ ...item, precioNuevo: 1000 }], -5);
    expect(tope.ingresoNuevo).toBe(1000 * 200);
  });
  it("suma varios productos, ignora los sin ventas y no divide por cero", () => {
    const r = simularPrecios([item, { costo: 1, precioActual: 5, precioNuevo: 6, unidades30d: 0 }]);
    expect(r.utilidadActual).toBe(400_000);
    expect(simularPrecios([])).toMatchObject({ margenActual: 0, margenNuevo: 0, diferenciaUtilidad: 0 });
    expect(simularPrecios([{ costo: 5, precioActual: 0, precioNuevo: 10, unidades30d: 3 }]).utilidadNueva).toBe(15);
  });
  it("usa aritmética decimal exacta (sin 0,1 + 0,2)", () => {
    const r = simularPrecios([{ costo: 0.1, precioActual: 0.3, precioNuevo: 0.3, unidades30d: 1 }]);
    expect(r.utilidadActual).toBe(0.2);
  });
});

describe("ajustarPrecio", () => {
  it("aplica el % y redondea hacia arriba como el sistema", () => {
    expect(ajustarPrecio(10000, 5)).toBe(10500);
    expect(ajustarPrecio(9990, 3)).toBe(10300); // 10.289,7 → 10.300
    expect(ajustarPrecio(400, 10)).toBe(450);
    expect(ajustarPrecio(10000, -10)).toBe(9000);
  });
  it("un resultado inválido deja el precio como estaba", () => {
    expect(ajustarPrecio(1000, -100)).toBe(1000);
  });
});
