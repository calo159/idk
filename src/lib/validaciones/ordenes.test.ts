import { describe, expect, it } from "vitest";
import { esquemaOrdenCompra, esquemaPagoProveedor, esquemaRecibo, estadoVencimiento, totalOrden } from "./ordenes";

const U = "3f2b8c1e-5d4a-4e6f-9a1b-2c3d4e5f6a7b";

describe("orden de compra", () => {
  const base = { proveedor_id: U, bodega_id: U, fecha_esperada: "", nota: "", lineas: [{ producto_id: U, cantidad: 10, costo: 1500 }] };
  it("acepta una orden válida y rechaza sin líneas o con cantidad cero", () => {
    expect(esquemaOrdenCompra.safeParse(base).success).toBe(true);
    expect(esquemaOrdenCompra.safeParse({ ...base, lineas: [] }).success).toBe(false);
    expect(esquemaOrdenCompra.safeParse({ ...base, lineas: [{ ...base.lineas[0], cantidad: 0 }] }).success).toBe(false);
  });
  it("el total redondea por línea", () => {
    expect(totalOrden([{ cantidad: 3, costo: 0.335 }, { cantidad: 2, costo: 1000 }]).toFixed(2)).toBe("2001.01");
  });
});

describe("recibo", () => {
  it("condición de pago válida y días de crédito acotados", () => {
    const l = [{ detalle_id: U, cantidad: 5 }];
    expect(esquemaRecibo.parse({ orden_id: U, condicion: "credito", lineas: l }).dias_credito).toBe(30);
    expect(esquemaRecibo.safeParse({ orden_id: U, condicion: "fiado", lineas: l }).success).toBe(false);
    expect(esquemaRecibo.safeParse({ orden_id: U, condicion: "credito", dias_credito: 400, lineas: l }).success).toBe(false);
  });
});

describe("pago a proveedor", () => {
  it("monto positivo y sin crédito", () => {
    expect(esquemaPagoProveedor.safeParse({ cxp_id: U, monto: 1000, metodo: "efectivo" }).success).toBe(true);
    expect(esquemaPagoProveedor.safeParse({ cxp_id: U, monto: 0, metodo: "efectivo" }).success).toBe(false);
    expect(esquemaPagoProveedor.safeParse({ cxp_id: U, monto: 5, metodo: "credito" }).success).toBe(false);
  });
});

describe("estadoVencimiento", () => {
  it("vencida, por vencer (≤ 7 días) y al día", () => {
    expect(estadoVencimiento("2026-11-06", "2026-11-07")).toBe("vencida");
    expect(estadoVencimiento("2026-11-07", "2026-11-07")).toBe("por_vencer");
    expect(estadoVencimiento("2026-11-14", "2026-11-07")).toBe("por_vencer");
    expect(estadoVencimiento("2026-11-15", "2026-11-07")).toBe("al_dia");
  });
});
