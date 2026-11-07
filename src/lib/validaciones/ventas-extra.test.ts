import { describe, expect, it } from "vitest";
import {
  esquemaAbonoSeparado,
  esquemaCotizacion,
  esquemaDevolucionCliente,
  esquemaEntregaSeparado,
  esquemaSeparado,
  textoCotizacion,
  totalDocumento,
} from "./ventas-extra";

const U = "3f2b8c1e-5d4a-4e6f-9a1b-2c3d4e5f6a7b";
const linea = { producto_id: U, cantidad: 2, precio: 15000 };

describe("cotización y separado", () => {
  it("cotización: sin líneas no pasa; cliente y vigencia son opcionales", () => {
    expect(esquemaCotizacion.safeParse({ lineas: [linea] }).success).toBe(true);
    expect(esquemaCotizacion.safeParse({ lineas: [] }).success).toBe(false);
    expect(esquemaCotizacion.safeParse({ lineas: [linea], vigencia_hasta: "2026-13-40" }).success).toBe(false);
  });
  it("separado: exige cliente y bodega; el abono inicial por defecto es cero y en efectivo", () => {
    const r = esquemaSeparado.parse({ cliente_id: U, bodega_id: U, lineas: [linea] });
    expect(r.abono_inicial).toBe(0);
    expect(r.metodo).toBe("efectivo");
    expect(esquemaSeparado.safeParse({ bodega_id: U, lineas: [linea] }).success).toBe(false);
  });
  it("abono: positivo y nunca a crédito; entrega: no se puede fiar", () => {
    expect(esquemaAbonoSeparado.safeParse({ separado_id: U, monto: 1000, metodo: "nequi" }).success).toBe(true);
    expect(esquemaAbonoSeparado.safeParse({ separado_id: U, monto: 0, metodo: "nequi" }).success).toBe(false);
    expect(esquemaAbonoSeparado.safeParse({ separado_id: U, monto: 5, metodo: "credito" }).success).toBe(false);
    expect(esquemaEntregaSeparado.safeParse({ separado_id: U, pagos: [{ metodo: "credito", monto: 5 }] }).success).toBe(false);
  });
});

describe("devolución de cliente", () => {
  it("pide motivo, forma de reembolso y líneas con cantidad positiva", () => {
    const base = { venta_id: U, motivo: "No servía", reembolso: "efectivo", lineas: [{ venta_detalle_id: U, cantidad: 1 }] };
    expect(esquemaDevolucionCliente.safeParse(base).success).toBe(true);
    expect(esquemaDevolucionCliente.safeParse({ ...base, reembolso: "bitcoin" }).success).toBe(false);
    expect(esquemaDevolucionCliente.safeParse({ ...base, motivo: "ab" }).success).toBe(false);
    expect(esquemaDevolucionCliente.safeParse({ ...base, lineas: [] }).success).toBe(false);
  });
});

describe("utilidades", () => {
  it("total del documento con descuento por línea", () => {
    expect(totalDocumento([{ cantidad: 2, precio: 15000, descuento: 1000 }, { cantidad: 1, precio: 500 }]).toNumber()).toBe(29500);
  });
  it("texto de cotización para WhatsApp", () => {
    const t = textoCotizacion({ negocio: "Ferretería El Puerto", numero: 7, vigencia: "22 nov 2026", total: "$ 30.000", lineas: [{ nombre: "Martillo", cantidad: 2, subtotal: "$ 30.000" }] });
    expect(t).toContain("Cotización #7");
    expect(t).toContain("• 2 × Martillo: $ 30.000");
    expect(t).toContain("*Total: $ 30.000*");
  });
});
