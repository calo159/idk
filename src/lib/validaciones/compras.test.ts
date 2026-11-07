import { describe, expect, it } from "vitest";
import { esquemaCompra, esquemaProveedor, totalCompra } from "./compras";

const U = "3f2b8c1e-5d4a-4e6f-9a1b-2c3d4e5f6a7b";
const linea = { producto_id: U, presentacion_id: null, cantidad: 2, costo_unitario: 1500 };

describe("proveedor", () => {
  it("acepta datos mínimos y normaliza el celular", () => {
    const r = esquemaProveedor.parse({ nombre: "Ferrodistribuciones SAS", nit: "900123456-7", telefono: "300 123 4567" });
    expect(r.telefono).toBe("3001234567");
  });
  it("rechaza NIT y celular inválidos", () => {
    expect(esquemaProveedor.safeParse({ nombre: "Ferro", nit: "abc", telefono: "" }).success).toBe(false);
    expect(esquemaProveedor.safeParse({ nombre: "Ferro", telefono: "123" }).success).toBe(false);
  });
});

describe("compra", () => {
  const base = { proveedor_id: null, bodega_id: U, fecha: "2026-11-07", lineas: [linea] };
  it("exige al menos una línea y fecha válida", () => {
    expect(esquemaCompra.safeParse(base).success).toBe(true);
    expect(esquemaCompra.safeParse({ ...base, lineas: [] }).success).toBe(false);
    expect(esquemaCompra.safeParse({ ...base, fecha: "07/11/2026" }).success).toBe(false);
  });
  it("rechaza cantidad cero y costo negativo", () => {
    expect(esquemaCompra.safeParse({ ...base, lineas: [{ ...linea, cantidad: 0 }] }).success).toBe(false);
    expect(esquemaCompra.safeParse({ ...base, lineas: [{ ...linea, costo_unitario: -1 }] }).success).toBe(false);
  });
});

describe("totalCompra", () => {
  it("redondea por línea como Postgres (HALF_UP)", () => {
    // 3 × 0.335 = 1.005 → 1.01 ; 1 × 0.10 → 0.10
    const t = totalCompra([
      { cantidad: 3, costo_unitario: 0.335 },
      { cantidad: 1, costo_unitario: 0.1 },
    ]);
    expect(t.toFixed(2)).toBe("1.11");
  });
});
