import { describe, expect, it } from "vitest";
import {
  celularParaWhatsApp,
  erroresPorCampo,
  formatoCelular,
  normalizarCelularCO,
  zCantidad,
  zCantidadAjuste,
  zCelular,
  zCelularOpcional,
  zCodigoBarras,
  zCorreo,
  zDia,
  zDocumentoCO,
  zMetodoPago,
  zMonto,
  zMontoPositivo,
  zTexto,
} from "./comunes";
import { z } from "zod";

describe("zMonto", () => {
  it("acepta valores válidos", () => {
    expect(zMonto.parse(12500)).toBe(12500);
    expect(zMonto.parse(0)).toBe(0);
    expect(zMonto.parse(12500.5)).toBe(12500.5);
  });
  it("rechaza negativos, más de 2 decimales y desbordes", () => {
    expect(zMonto.safeParse(-1).success).toBe(false);
    expect(zMonto.safeParse(10.123).success).toBe(false);
    expect(zMonto.safeParse(1e15).success).toBe(false);
    expect(zMonto.safeParse(NaN).success).toBe(false);
    expect(zMonto.safeParse("100").success).toBe(false);
  });
  it("zMontoPositivo rechaza cero", () => {
    expect(zMontoPositivo.safeParse(0).success).toBe(false);
    expect(zMontoPositivo.safeParse(1).success).toBe(true);
  });
});

describe("zCantidad", () => {
  it("acepta metros, kilos y fracciones", () => {
    expect(zCantidad.parse(2.5)).toBe(2.5);
    expect(zCantidad.parse(0.125)).toBe(0.125);
  });
  it("rechaza 0, negativos y 4 decimales", () => {
    expect(zCantidad.safeParse(0).success).toBe(false);
    expect(zCantidad.safeParse(-1).success).toBe(false);
    expect(zCantidad.safeParse(0.0001).success).toBe(false);
  });
  it("zCantidadAjuste permite negativos pero no cero", () => {
    expect(zCantidadAjuste.parse(-3)).toBe(-3);
    expect(zCantidadAjuste.safeParse(0).success).toBe(false);
  });
});

describe("celular colombiano", () => {
  const validos: [string, string][] = [
    ["3001234567", "3001234567"],
    ["300 123 4567", "3001234567"],
    ["+57 300 123 4567", "3001234567"],
    ["573001234567", "3001234567"],
    ["(300) 123-4567", "3001234567"],
    ["0057 3001234567", "3001234567"],
  ];
  it.each(validos)("normaliza %j", (entrada, esperado) => {
    expect(normalizarCelularCO(entrada)).toBe(esperado);
  });
  it.each(["2001234567", "300123456", "30012345678", "hola", ""])("rechaza %j", (entrada) => {
    expect(normalizarCelularCO(entrada)).toBeNull();
  });
  it("zCelular transforma y zCelularOpcional deja vacío", () => {
    expect(zCelular.parse("+57 311 222 3344")).toBe("3112223344");
    expect(zCelular.safeParse("123").success).toBe(false);
    expect(zCelularOpcional.parse("")).toBeUndefined();
    expect(zCelularOpcional.parse(undefined)).toBeUndefined();
    expect(zCelularOpcional.parse("3112223344")).toBe("3112223344");
    expect(zCelularOpcional.safeParse("12").success).toBe(false);
  });
  it("formatos de salida", () => {
    expect(formatoCelular("3001234567")).toBe("300 123 4567");
    expect(celularParaWhatsApp("3001234567")).toBe("573001234567");
  });
});

describe("otros esquemas", () => {
  it("correo se normaliza", () => {
    expect(zCorreo.parse("  Dueno@Ferreteria.CO ")).toBe("dueno@ferreteria.co");
    expect(zCorreo.safeParse("no-es-correo").success).toBe(false);
  });
  it("documento NIT/cédula", () => {
    expect(zDocumentoCO.safeParse("900123456-7").success).toBe(true);
    expect(zDocumentoCO.safeParse("1234").success).toBe(false);
    expect(zDocumentoCO.safeParse("12.345.678").success).toBe(false);
  });
  it("código de barras", () => {
    expect(zCodigoBarras.safeParse("7701234567890").success).toBe(true);
    expect(zCodigoBarras.safeParse("ab").success).toBe(false);
    expect(zCodigoBarras.safeParse("hola mundo").success).toBe(false);
  });
  it("día", () => {
    expect(zDia.safeParse("2026-11-07").success).toBe(true);
    expect(zDia.safeParse("2026-02-30").success).toBe(false);
  });
  it("método de pago", () => {
    expect(zMetodoPago.safeParse("nequi").success).toBe(true);
    expect(zMetodoPago.safeParse("bitcoin").success).toBe(false);
  });
  it("zTexto recorta y valida", () => {
    expect(zTexto(1, 10, "El nombre").parse("  Martillo  ")).toBe("Martillo");
    const r = zTexto(1, 10, "El nombre").safeParse("   ");
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe("El nombre es obligatorio");
  });
  it("erroresPorCampo", () => {
    const r = z.object({ nombre: zTexto(1, 5, "El nombre"), precio: zMonto }).safeParse({
      nombre: "",
      precio: -5,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(erroresPorCampo(r.error)).toEqual({
        nombre: "El nombre es obligatorio",
        precio: "El valor no puede ser negativo",
      });
    }
  });
});
