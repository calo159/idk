import { describe, expect, it } from "vitest";
import { esquemaConteoLinea, esquemaConteoNuevo, esquemaTraslado } from "./bodegas";

const U1 = "3f2b8c1e-5d4a-4e6f-9a1b-2c3d4e5f6a7b";
const U2 = "4f2b8c1e-5d4a-4e6f-9a1b-2c3d4e5f6a7b";
const U3 = "5f2b8c1e-5d4a-4e6f-9a1b-2c3d4e5f6a7b";

describe("traslado", () => {
  const base = { bodega_origen_id: U1, bodega_destino_id: U2, nota: "", lineas: [{ producto_id: U3, cantidad: 5 }] };
  it("acepta un traslado válido", () => {
    expect(esquemaTraslado.safeParse(base).success).toBe(true);
  });
  it("rechaza origen = destino, sin líneas, cantidades inválidas y productos repetidos", () => {
    expect(esquemaTraslado.safeParse({ ...base, bodega_destino_id: U1 }).success).toBe(false);
    expect(esquemaTraslado.safeParse({ ...base, lineas: [] }).success).toBe(false);
    expect(esquemaTraslado.safeParse({ ...base, lineas: [{ producto_id: U3, cantidad: 0 }] }).success).toBe(false);
    expect(esquemaTraslado.safeParse({ ...base, lineas: [base.lineas[0], base.lineas[0]] }).success).toBe(false);
  });
});

describe("conteo", () => {
  it("nombre mínimo y categoría opcional", () => {
    expect(esquemaConteoNuevo.safeParse({ bodega_id: U1, nombre: "Conteo", categoria_id: "" }).success).toBe(true);
    expect(esquemaConteoNuevo.safeParse({ bodega_id: U1, nombre: "ab", categoria_id: "" }).success).toBe(false);
  });
  it("la cantidad contada acepta cero y decimales de hasta 3, no negativos", () => {
    const l = { conteo_id: U1, producto_id: U2 };
    expect(esquemaConteoLinea.parse({ ...l, cantidad: "0" }).cantidad).toBe(0);
    expect(esquemaConteoLinea.parse({ ...l, cantidad: "12,5" }).cantidad).toBe(12.5);
    expect(esquemaConteoLinea.safeParse({ ...l, cantidad: "-1" }).success).toBe(false);
    expect(esquemaConteoLinea.safeParse({ ...l, cantidad: "1,2345" }).success).toBe(false);
    expect(esquemaConteoLinea.safeParse({ ...l, cantidad: "" }).success).toBe(false);
  });
});
