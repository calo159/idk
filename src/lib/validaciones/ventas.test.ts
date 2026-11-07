import { describe, expect, it } from "vitest";
import { esquemaVenta } from "./ventas";

const U = "3f2b8c1e-5d4a-4e6f-9a1b-2c3d4e5f6a7b";
const base = {
  offline_id: U,
  bodega_id: U,
  lineas: [{ producto_id: U, cantidad: 1, precio_unitario: 1000 }],
  pagos: [{ metodo: "efectivo", monto: 1000 }],
};

describe("esquemaVenta", () => {
  it("acepta una venta mínima y completa los valores por defecto", () => {
    const r = esquemaVenta.parse(base);
    expect(r.descuento).toBe(0);
    expect(r.cliente_id).toBeNull();
    expect(r.lineas[0]!.descuento).toBe(0);
    expect(r.autorizar_exceso_cupo).toBe(false);
  });
  it("exige offline_id, líneas y pagos", () => {
    expect(esquemaVenta.safeParse({ ...base, offline_id: "x" }).success).toBe(false);
    expect(esquemaVenta.safeParse({ ...base, lineas: [] }).success).toBe(false);
    expect(esquemaVenta.safeParse({ ...base, pagos: [] }).success).toBe(false);
  });
  it("rechaza cantidades y precios inválidos y métodos desconocidos", () => {
    expect(esquemaVenta.safeParse({ ...base, lineas: [{ ...base.lineas[0], cantidad: 0 }] }).success).toBe(false);
    expect(esquemaVenta.safeParse({ ...base, lineas: [{ ...base.lineas[0], precio_unitario: -1 }] }).success).toBe(false);
    expect(esquemaVenta.safeParse({ ...base, pagos: [{ metodo: "bitcoin", monto: 1 }] }).success).toBe(false);
  });
  it("la fecha offline solo vale si es de los últimos 7 días y no futura", () => {
    const hace = (ms: number) => new Date(Date.now() - ms).toISOString();
    expect(esquemaVenta.safeParse({ ...base, creado_en: hace(3_600_000) }).success).toBe(true);
    expect(esquemaVenta.safeParse({ ...base, creado_en: hace(8 * 86_400_000) }).success).toBe(false);
    expect(esquemaVenta.safeParse({ ...base, creado_en: hace(-3_600_000) }).success).toBe(false);
    expect(esquemaVenta.safeParse({ ...base, creado_en: "ayer" }).success).toBe(false);
  });
});
