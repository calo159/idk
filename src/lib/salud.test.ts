import { describe, expect, it } from "vitest";
import { type Metricas, calcularSalud, nivelDe, prioridad, tendencia } from "./salud";

const base: Metricas = {
  desde: "2026-10-09", hasta: "2026-11-07", ventas_n: 120, ventas_netas: 10_000_000, utilidad: 3_000_000, costo_ventas: 7_000_000,
  inventario_valor: 7_000_000, vencido: 0, por_cobrar: 0, merma: 0, faltantes_caja: 0,
};
const comp = (m: Metricas, clave: string) => calcularSalud(m).componentes.find((c) => c.clave === clave)!;

describe("margen", () => {
  it("30 % o más = 100; 5 % o menos = 0; en medio, proporcional", () => {
    expect(comp(base, "margen").puntaje).toBe(100);
    expect(comp({ ...base, utilidad: 500_000 }, "margen").puntaje).toBe(0);
    expect(comp({ ...base, utilidad: 1_750_000 }, "margen").puntaje).toBe(50); // 17,5 % es la mitad del camino
    expect(comp({ ...base, utilidad: 4_000_000 }, "margen").puntaje).toBe(100); // no pasa de 100
    expect(comp({ ...base, utilidad: -200_000 }, "margen").puntaje).toBe(0); // no baja de 0
  });
  it("sin ventas no se puede medir", () => {
    expect(comp({ ...base, ventas_netas: 0, utilidad: 0 }, "margen").puntaje).toBeNull();
  });
  it("un margen bajo trae consejo y enlace a precios", () => {
    const c = comp({ ...base, utilidad: 800_000 }, "margen");
    expect(c.consejo).toMatch(/margen es bajo/);
    expect(c.href).toBe("/productos/precios");
    expect(c.detalle).toBe("Ganas 8 % de lo que vendes");
  });
});

describe("rotación", () => {
  it("30 días de inventario o menos = 100; 180 o más = 0", () => {
    expect(comp({ ...base, inventario_valor: 7_000_000, costo_ventas: 7_000_000 }, "rotacion").puntaje).toBe(100); // 30 días justos
    expect(comp({ ...base, inventario_valor: 42_000_000, costo_ventas: 7_000_000 }, "rotacion").puntaje).toBe(0); // 180 días
    expect(comp({ ...base, inventario_valor: 24_500_000, costo_ventas: 7_000_000 }, "rotacion").puntaje).toBe(50); // 105 días
  });
  it("mercancía que no se vende vale 0 y manda a la promoción; sin inventario no se mide", () => {
    const c = comp({ ...base, costo_ventas: 0, ventas_netas: 0, utilidad: 0 }, "rotacion");
    expect(c.puntaje).toBe(0);
    expect(c.href).toBe("/productos/promociones");
    expect(comp({ ...base, inventario_valor: 0 }, "rotacion").puntaje).toBeNull();
  });
});

describe("cartera", () => {
  it("sin deuda vencida = 100", () => expect(comp(base, "cartera").puntaje).toBe(100));
  it("vencido igual al 50 % de lo vendido = 0; 25 % = 50", () => {
    expect(comp({ ...base, vencido: 5_000_000 }, "cartera").puntaje).toBe(0);
    expect(comp({ ...base, vencido: 2_500_000 }, "cartera").puntaje).toBe(50);
  });
  it("deuda vencida y ninguna venta = 0", () => {
    expect(comp({ ...base, ventas_netas: 0, utilidad: 0, vencido: 100_000 }, "cartera").puntaje).toBe(0);
  });
});

describe("pérdidas", () => {
  it("sin mermas ni faltantes = 100; 3 % de las ventas = 0", () => {
    expect(comp(base, "perdidas").puntaje).toBe(100);
    expect(comp({ ...base, merma: 200_000, faltantes_caja: 100_000 }, "perdidas").puntaje).toBe(0);
    expect(comp({ ...base, merma: 100_000, faltantes_caja: 50_000 }, "perdidas").puntaje).toBe(50);
  });
});

describe("puntaje general", () => {
  it("un negocio sano saca 100 y es «excelente»", () => {
    const s = calcularSalud(base);
    expect(s).toMatchObject({ puntaje: 100, nivel: "excelente" });
    expect(prioridad(s)).toBeNull();
  });
  it("promedia con los pesos (30/25/25/20)", () => {
    // margen 50 (×30) + rotación 100 (×25) + cartera 100 (×25) + pérdidas 100 (×20) = 1500+2500+2500+2000 = 8500 / 100
    expect(calcularSalud({ ...base, utilidad: 1_750_000 }).puntaje).toBe(85);
  });
  it("lo que no se puede medir no cuenta (se reparte el peso entre lo que sí)", () => {
    const s = calcularSalud({ ...base, inventario_valor: 0 }); // sin rotación
    expect(s.componentes.find((c) => c.clave === "rotacion")!.puntaje).toBeNull();
    expect(s.puntaje).toBe(100);
  });
  it("sin ningún dato no inventa un puntaje", () => {
    const s = calcularSalud({ ...base, ventas_netas: 0, utilidad: 0, costo_ventas: 0, inventario_valor: 0, vencido: 0 });
    // la cartera sin deuda cuenta 100: el puntaje es de lo único medible
    expect(s.componentes.filter((c) => c.puntaje !== null)).toHaveLength(1);
    expect(s.puntaje).toBe(100);
  });
  it("niveles por rango", () => {
    expect([nivelDe(95), nivelDe(80), nivelDe(79), nivelDe(60), nivelDe(59), nivelDe(40), nivelDe(39), nivelDe(0)]).toEqual(["excelente", "excelente", "bien", "bien", "atencion", "atencion", "critico", "critico"]);
  });
  it("la prioridad es el componente que más puntos haría ganar", () => {
    // margen 0 (pierde 100×30=3000) vs cartera 50 (pierde 50×25=1250)
    const s = calcularSalud({ ...base, utilidad: 400_000, vencido: 2_500_000 });
    expect(prioridad(s)!.clave).toBe("margen");
  });
  it("la tendencia es la diferencia de puntos y es null sin foto anterior", () => {
    const a = calcularSalud(base);
    const b = calcularSalud({ ...base, utilidad: 1_750_000 });
    expect(tendencia(a, b)).toBe(15);
    expect(tendencia(b, a)).toBe(-15);
    expect(tendencia(a, null)).toBeNull();
  });
});
