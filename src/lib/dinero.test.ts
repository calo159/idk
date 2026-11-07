import { describe, expect, it } from "vitest";
import {
  cantidad,
  costoPromedioPonderado,
  dinero,
  formatoCantidad,
  formatoCOP,
  formatoCOPCorto,
  leerNumeroCO,
  margenSobreVenta,
  multiplicar,
  paraBd,
  porcentaje,
  precioPorMargen,
  prorratear,
  repartir,
  restar,
  subtotalLinea,
  sumar,
  vuelto,
} from "./dinero";

describe("sumas seguras (sin errores de punto flotante)", () => {
  it("0.1 + 0.2 = 0.30 exacto", () => {
    expect(sumar(0.1, 0.2).toFixed(2)).toBe("0.30");
  });
  it("suma muchos valores sin acumular error", () => {
    const valores = Array<number>(1000).fill(0.1);
    expect(sumar(...valores).toFixed(2)).toBe("100.00");
  });
  it("acepta strings, numbers y null", () => {
    expect(sumar("12500.50", 1000, null, undefined).toFixed(2)).toBe("13500.50");
  });
  it("resta", () => {
    expect(restar(100000, 87500.25).toFixed(2)).toBe("12499.75");
  });
  it("rechaza valores no numéricos", () => {
    expect(() => dinero(NaN)).toThrow();
    expect(() => dinero(Infinity)).toThrow();
  });
});

describe("redondeo como Postgres (mitad hacia afuera de cero)", () => {
  it("redondea 2.675 a 2.68 (el float daría 2.67)", () => {
    expect(dinero("2.675").toFixed(2)).toBe("2.68");
    expect(dinero(2.675).toFixed(2)).toBe("2.68");
  });
  it("negativos redondean hacia afuera de cero", () => {
    expect(dinero("-2.675").toFixed(2)).toBe("-2.68");
  });
  it("cantidad conserva 3 decimales", () => {
    expect(cantidad("2.34567").toFixed(3)).toBe("2.346");
  });
});

describe("líneas de venta/compra (igual que las columnas generadas de la BD)", () => {
  it("multiplicar = round(cantidad * costo, 2)", () => {
    expect(multiplicar(3333.33, 3).toFixed(2)).toBe("9999.99");
    expect(multiplicar(1500, 2.5).toFixed(2)).toBe("3750.00");
    expect(multiplicar(100, 0.333).toFixed(2)).toBe("33.30");
  });
  it("subtotalLinea = round(cant * precio - descuento, 2)", () => {
    expect(subtotalLinea(2.5, 4800, 500).toFixed(2)).toBe("11500.00");
    expect(subtotalLinea(3, 1000).toFixed(2)).toBe("3000.00");
  });
  it("porcentaje (IVA 19 %)", () => {
    expect(porcentaje(100000, 19).toFixed(2)).toBe("19000.00");
  });
});

describe("margen y precios", () => {
  it("margen sobre venta", () => {
    expect(margenSobreVenta(10000, 7000).toFixed(2)).toBe("30.00");
    expect(margenSobreVenta(0, 7000).toFixed(2)).toBe("0.00");
  });
  it("precio por margen objetivo", () => {
    expect(precioPorMargen(7000, 30).toFixed(2)).toBe("10000.00");
    expect(() => precioPorMargen(7000, 100)).toThrow();
  });
  it("vuelto nunca es negativo", () => {
    expect(vuelto(50000, 37500).toFixed(2)).toBe("12500.00");
    expect(vuelto(30000, 37500).toFixed(2)).toBe("0.00");
  });
});

describe("costo promedio ponderado", () => {
  it("primera entrada fija el costo", () => {
    expect(costoPromedioPonderado(0, 0, 10, 5000).toFixed(2)).toBe("5000.00");
  });
  it("promedia con el stock existente", () => {
    // 10 u a 5.000 + 10 u a 7.000 = 6.000
    expect(costoPromedioPonderado(10, 5000, 10, 7000).toFixed(2)).toBe("6000.00");
  });
  it("pondera por cantidades distintas", () => {
    // 30 a 1.000 + 10 a 2.000 = 1.250
    expect(costoPromedioPonderado(30, 1000, 10, 2000).toFixed(2)).toBe("1250.00");
  });
  it("con stock negativo o cero toma el costo de la entrada (como el trigger)", () => {
    expect(costoPromedioPonderado(-4, 900, 10, 1200).toFixed(2)).toBe("1200.00");
  });
  it("una entrada sin costo no cambia el promedio", () => {
    expect(costoPromedioPonderado(10, 5000, 5, 0).toFixed(2)).toBe("5000.00");
  });
  it("redondea a 2 decimales", () => {
    // (3*100 + 1*101)/4 = 100.25
    expect(costoPromedioPonderado(3, 100, 1, 101).toFixed(2)).toBe("100.25");
    // (2*100 + 1*101)/3 = 100.333.. -> 100.33
    expect(costoPromedioPonderado(2, 100, 1, 101).toFixed(2)).toBe("100.33");
  });
});

describe("repartos que no pierden centavos", () => {
  it("repartir 100 en 3 suma exactamente 100", () => {
    const partes = repartir(100, 3);
    expect(partes.map((p) => p.toFixed(2))).toEqual(["33.34", "33.33", "33.33"]);
    expect(sumar(...partes).toFixed(2)).toBe("100.00");
  });
  it("prorratear un descuento por pesos de línea", () => {
    const partes = prorratear(1000, [30000, 20000, 50000]);
    expect(partes.map((p) => p.toFixed(2))).toEqual(["300.00", "200.00", "500.00"]);
  });
  it("prorratear con residuo mantiene el total", () => {
    const partes = prorratear(10, [1, 1, 1]);
    expect(sumar(...partes).toFixed(2)).toBe("10.00");
  });
  it("pesos en cero lanzan error", () => {
    expect(() => prorratear(10, [0, 0])).toThrow();
  });
});

describe("formato colombiano", () => {
  it("$ 12.500", () => {
    expect(formatoCOP(12500)).toBe("$ 12.500");
  });
  it("millones con puntos", () => {
    expect(formatoCOP(1234567)).toBe("$ 1.234.567");
  });
  it("muestra centavos solo si existen", () => {
    expect(formatoCOP(12500.5)).toBe("$ 12.500,50");
    expect(formatoCOP(12500, { decimales: true })).toBe("$ 12.500,00");
  });
  it("cero y negativos", () => {
    expect(formatoCOP(0)).toBe("$ 0");
    expect(formatoCOP(-8000)).toBe("-$ 8.000");
    expect(formatoCOP(-0.001)).toBe("$ 0");
  });
  it("sin símbolo", () => {
    expect(formatoCOP(1500, { simbolo: false })).toBe("1.500");
  });
  it("acepta strings que vienen de la base de datos", () => {
    expect(formatoCOP("45900.00")).toBe("$ 45.900");
  });
  it("formato corto", () => {
    expect(formatoCOPCorto(950)).toBe("$ 950");
    expect(formatoCOPCorto(350000)).toBe("$ 350 mil");
    expect(formatoCOPCorto(1250000)).toBe("$ 1,3 M");
    expect(formatoCOPCorto(-2400000)).toBe("-$ 2,4 M");
  });
  it("cantidades sin ceros sobrantes", () => {
    expect(formatoCantidad(12)).toBe("12");
    expect(formatoCantidad(2.5)).toBe("2,5");
    expect(formatoCantidad(0.125)).toBe("0,125");
    expect(formatoCantidad(1500)).toBe("1.500");
    expect(formatoCantidad(-3)).toBe("-3");
  });
});

describe("lectura de lo que escribe el usuario", () => {
  const casos: [string, string | null][] = [
    ["12500", "12500"],
    ["12.500", "12500"],
    ["$ 12.500", "12500"],
    ["$12.500", "12500"],
    ["1.234.567", "1234567"],
    ["12.500,50", "12500.5"],
    ["12,5", "12.5"],
    ["0,125", "0.125"],
    ["12.5", "12.5"],
    ["  3000  ", "3000"],
    ["-1.000", "-1000"],
    ["", null],
    ["abc", null],
    ["12,5,3", null],
    ["1.2.3", null],
    ["12.34.567", null],
  ];
  it.each(casos)("leerNumeroCO(%j) = %j", (texto, esperado) => {
    const r = leerNumeroCO(texto);
    expect(r === null ? null : r.toString()).toBe(esperado);
  });
});

describe("hacia la base de datos", () => {
  it("paraBd entrega string con 2 decimales y sin notación científica", () => {
    expect(paraBd(12500)).toBe("12500.00");
    expect(paraBd("0.1")).toBe("0.10");
    expect(paraBd(1e-7)).toBe("0.00");
    expect(paraBd(99999999999.99)).toBe("99999999999.99");
  });
});
