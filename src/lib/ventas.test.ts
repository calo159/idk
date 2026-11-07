import { describe, expect, it } from "vitest";
import { descuentoPorPorcentaje, resumirPagos, subtotalVenta, totalVenta } from "./ventas";

describe("totales de venta", () => {
  it("redondea por línea como Postgres y resta el descuento global", () => {
    // 3 × 333,335 = 1000,005 → 1000,01 ; 1 × 500
    const lineas = [
      { cantidad: 3, precio_unitario: "333.335" },
      { cantidad: 1, precio_unitario: 500 },
    ];
    expect(subtotalVenta(lineas).toFixed(2)).toBe("1500.01");
    expect(totalVenta(lineas, 100).toFixed(2)).toBe("1400.01");
  });
  it("el descuento de línea reduce el subtotal; el total nunca es negativo", () => {
    expect(subtotalVenta([{ cantidad: 2, precio_unitario: 1000, descuento: 300 }]).toNumber()).toBe(1700);
    expect(totalVenta([{ cantidad: 1, precio_unitario: 100 }], 500).toNumber()).toBe(0);
  });
  it("descuento por porcentaje", () => {
    expect(descuentoPorPorcentaje(2, 10000, 10).toNumber()).toBe(2000);
  });
});

describe("resumirPagos", () => {
  it("efectivo exacto: sin vuelto ni faltante", () => {
    const r = resumirPagos(15000, [{ metodo: "efectivo", monto: 15000 }]);
    expect(r.faltante.toNumber()).toBe(0);
    expect(r.vuelto.toNumber()).toBe(0);
  });
  it("paga con billete grande: devuelve vuelto y guarda solo lo aplicado", () => {
    const r = resumirPagos(12500, [{ metodo: "efectivo", monto: 20000 }]);
    expect(r.vuelto.toNumber()).toBe(7500);
    expect(r.pagosParaBd).toEqual([{ metodo: "efectivo", monto: expect.anything() }]);
    expect(r.pagosParaBd[0]!.monto.toNumber()).toBe(12500);
    expect(r.faltante.toNumber()).toBe(0);
  });
  it("pago mixto: Nequi + efectivo con vuelto sale del efectivo", () => {
    const r = resumirPagos(50000, [
      { metodo: "nequi", monto: 30000 },
      { metodo: "efectivo", monto: 30000 },
    ]);
    expect(r.vuelto.toNumber()).toBe(10000);
    expect(r.pagosParaBd.map((p) => [p.metodo, p.monto.toNumber()])).toEqual([
      ["nequi", 30000],
      ["efectivo", 20000],
    ]);
  });
  it("pagar de más con Nequi NO genera vuelto: queda inválido (suma ≠ total)", () => {
    const r = resumirPagos(10000, [{ metodo: "nequi", monto: 12000 }]);
    expect(r.vuelto.toNumber()).toBe(0);
    expect(r.faltante.toNumber()).toBe(-2000);
  });
  it("faltante cuando no alcanza; ignora montos en cero", () => {
    const r = resumirPagos(10000, [
      { metodo: "efectivo", monto: 4000 },
      { metodo: "tarjeta", monto: 0 },
    ]);
    expect(r.faltante.toNumber()).toBe(6000);
    expect(r.pagosParaBd).toHaveLength(1);
  });
  it("el fiado cuenta como pago a crédito", () => {
    const r = resumirPagos(30000, [
      { metodo: "efectivo", monto: 10000 },
      { metodo: "credito", monto: 20000 },
    ]);
    expect(r.faltante.toNumber()).toBe(0);
  });
});
