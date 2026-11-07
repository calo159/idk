import { describe, expect, it } from "vitest";
import { esquemaComision, esquemaMeta, primerDiaDelMes, zMes } from "./comisiones";

const U = "3f2b8c1e-5d4a-4e6f-9a1b-2c3d4e5f6a7b";

describe("comisiones", () => {
  it("lee la meta en pesos colombianos", () => {
    expect(esquemaMeta.parse({ usuario_id: U, meta: "$ 5.000.000" }).meta).toBe(5000000);
    expect(esquemaMeta.safeParse({ usuario_id: U, meta: "-1" }).success).toBe(false);
  });
  it("regla general (sin vendedor) o personal; acepta coma decimal; limita a 100 %", () => {
    expect(esquemaComision.parse({ usuario_id: "", base: "ventas", porcentaje: "2,5", bono: "" })).toEqual({ usuario_id: null, base: "ventas", porcentaje: 2.5, bono: 0 });
    expect(esquemaComision.parse({ usuario_id: U, base: "utilidad", porcentaje: "10", bono: "1" }).usuario_id).toBe(U);
    expect(esquemaComision.safeParse({ usuario_id: "", base: "ventas", porcentaje: "150", bono: "" }).success).toBe(false);
    expect(esquemaComision.safeParse({ usuario_id: "", base: "ganancia", porcentaje: "2", bono: "" }).success).toBe(false);
  });
  it("mes", () => {
    expect(primerDiaDelMes("2026-11-07")).toBe("2026-11-01");
    expect(zMes.parse("2026-11")).toBe("2026-11-01");
    expect(zMes.safeParse("noviembre").success).toBe(false);
  });
});
