import { describe, expect, it } from "vitest";
import { diferenciaConteo, estadoStock, valorInventario } from "./inventario";

describe("estadoStock", () => {
  it("clasifica agotado, bajo y ok", () => {
    expect(estadoStock(0, 5)).toBe("agotado");
    expect(estadoStock(-2, 0)).toBe("agotado");
    expect(estadoStock(5, 5)).toBe("bajo");
    expect(estadoStock(5.001, 5)).toBe("ok");
    expect(estadoStock(1, 0)).toBe("ok");
    expect(estadoStock(0, 5, false)).toBe("sin_control");
  });
});

describe("valorInventario", () => {
  it("suma cantidad × costo sin errores de coma flotante e ignora negativos", () => {
    const v = valorInventario([
      { cantidad: "0.1", costo_promedio: "0.2" },
      { cantidad: "0.2", costo_promedio: "0.1" },
      { cantidad: "10.5", costo_promedio: "1000" },
      { cantidad: "-3", costo_promedio: "999" },
    ]);
    expect(v.toFixed(2)).toBe("10500.04");
  });
});

describe("diferenciaConteo", () => {
  it("sobrante positivo, faltante negativo", () => {
    expect(diferenciaConteo("12", "10").toNumber()).toBe(2);
    expect(diferenciaConteo("9.5", "10").toNumber()).toBe(-0.5);
    expect(diferenciaConteo("10", "10").isZero()).toBe(true);
  });
});
