import { describe, expect, it } from "vitest";
import { aCSV, celdaCSV, esPeriodo, rangoPeriodo, variacionPorcentual } from "./reportes";

describe("rangoPeriodo", () => {
  const hoy = "2026-11-07";
  it("hoy, ayer y ventanas móviles", () => {
    expect(rangoPeriodo("hoy", hoy)).toEqual({ desde: "2026-11-07", hasta: "2026-11-07" });
    expect(rangoPeriodo("ayer", hoy)).toEqual({ desde: "2026-11-06", hasta: "2026-11-06" });
    expect(rangoPeriodo("7d", hoy)).toEqual({ desde: "2026-11-01", hasta: "2026-11-07" });
    expect(rangoPeriodo("30d", hoy)).toEqual({ desde: "2026-10-09", hasta: "2026-11-07" });
  });
  it("mes en curso llega hasta hoy; mes anterior es completo", () => {
    expect(rangoPeriodo("mes", hoy)).toEqual({ desde: "2026-11-01", hasta: "2026-11-07" });
    expect(rangoPeriodo("mes_anterior", hoy)).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" });
  });
  it("mes anterior cruza el año y respeta febrero bisiesto", () => {
    expect(rangoPeriodo("mes_anterior", "2026-01-15")).toEqual({ desde: "2025-12-01", hasta: "2025-12-31" });
    expect(rangoPeriodo("mes_anterior", "2028-03-02")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });
  it("valida el nombre del periodo", () => {
    expect(esPeriodo("7d")).toBe(true);
    expect(esPeriodo("año")).toBe(false);
    expect(esPeriodo(undefined)).toBe(false);
  });
});

describe("variacionPorcentual", () => {
  it("calcula subida y bajada; sin base devuelve null", () => {
    expect(variacionPorcentual(150, 100)).toBe(50);
    expect(variacionPorcentual(75, 100)).toBe(-25);
    expect(variacionPorcentual(10, 0)).toBeNull();
  });
});

describe("CSV", () => {
  it("escapa comillas, punto y coma y saltos de línea", () => {
    expect(celdaCSV('Tornillo "grande"; caja')).toBe('"Tornillo ""grande""; caja"');
    expect(celdaCSV("a\nb")).toBe('"a\nb"');
    expect(celdaCSV(null)).toBe("");
  });
  it("neutraliza fórmulas de Excel pero no los números negativos", () => {
    expect(celdaCSV("=SUMA(A1:A2)")).toBe("'=SUMA(A1:A2)");
    expect(celdaCSV("@cmd")).toBe("'@cmd");
    expect(celdaCSV("-5000")).toBe("-5000");
    expect(celdaCSV("-5000,50")).toBe('"-5000,50"'); // número con coma decimal: no se toca, solo se entrecomilla
  });
  it("arma el archivo con BOM, separador ; y CRLF", () => {
    expect(aCSV(["Producto", "Total"], [["Cemento", 90000]])).toBe("﻿Producto;Total\r\nCemento;90000\r\n");
  });
});
