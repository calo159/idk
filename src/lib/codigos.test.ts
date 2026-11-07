import { describe, expect, it } from "vitest";
import { digitoVerificadorGS1, esGS1Valido, normalizarCodigo, variantesCodigo } from "./codigos";

describe("códigos de barras", () => {
  it("valida EAN-13, EAN-8 y UPC-A reales", () => {
    expect(esGS1Valido("7701234567895")).toBe(digitoVerificadorGS1("770123456789") === 5);
    expect(esGS1Valido("4006381333931")).toBe(true); // EAN-13
    expect(esGS1Valido("96385074")).toBe(true); // EAN-8
    expect(esGS1Valido("036000291452")).toBe(true); // UPC-A
  });
  it("rechaza dígito verificador malo, letras y largos raros", () => {
    expect(esGS1Valido("4006381333932")).toBe(false);
    expect(esGS1Valido("ABC12345")).toBe(false);
    expect(esGS1Valido("12345")).toBe(false);
  });
  it("normaliza saltos de línea y espacios", () => {
    expect(normalizarCodigo(" 4006381333931\r\n")).toBe("4006381333931");
  });
  it("UPC-A y EAN-13 con cero inicial son el mismo producto", () => {
    expect(variantesCodigo("036000291452").sort()).toEqual(["0036000291452", "036000291452"]);
    expect(variantesCodigo("0036000291452")).toContain("036000291452");
    expect(variantesCodigo("ABC-1")).toEqual(["ABC-1"]);
  });
});
