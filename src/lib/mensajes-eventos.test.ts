import { describe, expect, it } from "vitest";
import { destinoWhatsApp, mensajeDeEvento } from "./mensajes-eventos";

describe("mensajeDeEvento", () => {
  it("alerta: icono por severidad y texto de la alerta", () => {
    const m = mensajeDeEvento("alerta.creada", { severidad: "alta", mensaje: "Faltante de caja de $ 12.000" }, "Ferretería El Puerto");
    expect(m).toBe("🔴 *Ferretería El Puerto*\nFaltante de caja de $ 12.000");
  });
  it("venta anulada incluye número, valor y motivo", () => {
    const m = mensajeDeEvento("venta.anulada", { numero: 42, total: 150000, motivo: "error de digitación" }, "N")!;
    expect(m).toContain("venta #42");
    expect(m).toContain("$ 150.000");
    expect(m).toContain("error de digitación");
  });
  it("caja cuadrada no avisa; con diferencia sí, distinguiendo faltante y sobrante", () => {
    expect(mensajeDeEvento("caja.cerrada", { diferencia: 0 }, "N")).toBeNull();
    expect(mensajeDeEvento("caja.cerrada", { diferencia: -5000 }, "N")).toContain("faltante de $ 5.000");
    expect(mensajeDeEvento("caja.cerrada", { diferencia: 1000 }, "N")).toContain("sobrante de $ 1.000");
  });
  it("limpia saltos de línea y recorta textos largos (el texto viene de datos del usuario)", () => {
    const m = mensajeDeEvento("ajuste.grande", { valor: 100000, motivo: "a\nb\n" + "x".repeat(500) }, "N")!;
    expect(m.split("\n")).toHaveLength(3);
    expect(m.length).toBeLessThan(300);
  });
  it("eventos sin aviso devuelven null", () => {
    expect(mensajeDeEvento("compra.anulada", {}, "N")).toBeNull();
    expect(mensajeDeEvento("algo.nuevo", {}, "N")).toBeNull();
  });
});

describe("destinoWhatsApp", () => {
  it("agrega el 57 a celulares colombianos y valida el formato", () => {
    expect(destinoWhatsApp("300 123 4567")).toBe("573001234567");
    expect(destinoWhatsApp("+57 301 555 0100")).toBe("573015550100");
    expect(destinoWhatsApp("6055551234")).toBeNull();
    expect(destinoWhatsApp(null)).toBeNull();
  });
});
