import { describe, expect, it } from "vitest";
import { esquemaGasto, esquemaMovimientoCaja } from "./gastos";

const U = "3f2b8c1e-5d4a-4e6f-9a1b-2c3d4e5f6a7b";

describe("gasto", () => {
  const base = { categoria: "Servicios públicos", descripcion: "Factura de energía", monto: "$ 185.400", metodo: "efectivo", fecha: "", turno_id: null };
  it("lee el monto en pesos y acepta fecha vacía", () => {
    const r = esquemaGasto.parse(base);
    expect(r.monto).toBe(185400);
    expect(r.fecha).toBeUndefined();
  });
  it("rechaza categoría inventada, monto cero, crédito y fecha mala", () => {
    expect(esquemaGasto.safeParse({ ...base, categoria: "Lujos" }).success).toBe(false);
    expect(esquemaGasto.safeParse({ ...base, monto: "0" }).success).toBe(false);
    expect(esquemaGasto.safeParse({ ...base, metodo: "credito" }).success).toBe(false);
    expect(esquemaGasto.safeParse({ ...base, fecha: "31/12/2026" }).success).toBe(false);
  });
});

describe("movimiento de caja", () => {
  it("exige motivo real y monto positivo", () => {
    const base = { turno_id: U, tipo: "retiro", monto: "50.000", motivo: "Consignación" };
    expect(esquemaMovimientoCaja.safeParse(base).success).toBe(true);
    expect(esquemaMovimientoCaja.safeParse({ ...base, motivo: "ok" }).success).toBe(false);
    expect(esquemaMovimientoCaja.safeParse({ ...base, monto: "-1" }).success).toBe(false);
    expect(esquemaMovimientoCaja.safeParse({ ...base, tipo: "regalo" }).success).toBe(false);
  });
});
