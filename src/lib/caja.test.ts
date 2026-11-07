import { describe, expect, it } from "vitest";
import {
  diferenciaCaja,
  efectivoEsperado,
  esquemaApertura,
  esquemaCierre,
  estadoCierre,
  totalConteo,
} from "./caja";

const U = "3f2b8c1e-5d4a-4e6f-9a1b-2c3d4e5f6a7b";

describe("conteo de efectivo", () => {
  it("suma billetes y monedas", () => {
    expect(totalConteo({ "50000": 2, "20000": 1, "5000": 3, "500": 4, "50": 2 }).toNumber()).toBe(137100);
  });
  it("conteo vacío es cero", () => {
    expect(totalConteo({}).toNumber()).toBe(0);
  });
});

describe("cierre", () => {
  it("valida denominaciones y cantidades", () => {
    expect(esquemaCierre.safeParse({ turno_id: U, conteo: { "50000": 2 } }).success).toBe(true);
    expect(esquemaCierre.safeParse({ turno_id: U, conteo: { "30000": 1 } }).success).toBe(false);
    expect(esquemaCierre.safeParse({ turno_id: U, conteo: { "1000": -1 } }).success).toBe(false);
    expect(esquemaCierre.safeParse({ turno_id: U, conteo: { "1000": 1.5 } }).success).toBe(false);
  });
  it("estado según la diferencia", () => {
    expect(estadoCierre(0)).toBe("cuadra");
    expect(estadoCierre(-5000)).toBe("faltante");
    expect(estadoCierre(200)).toBe("sobrante");
  });
  it("esperado = base + ventas en efectivo + abonos en efectivo", () => {
    const e = efectivoEsperado(100000, "250500.50", 20000);
    expect(e.toFixed(2)).toBe("370500.50");
    expect(diferenciaCaja(370000, e).toFixed(2)).toBe("-500.50");
  });
});

describe("apertura", () => {
  it("lee la base en pesos y acepta vacío como 0", () => {
    expect(esquemaApertura.parse({ base_inicial: "$ 100.000" }).base_inicial).toBe(100000);
    expect(esquemaApertura.parse({ base_inicial: "" }).base_inicial).toBe(0);
    expect(esquemaApertura.safeParse({ base_inicial: "-1" }).success).toBe(false);
  });
});
