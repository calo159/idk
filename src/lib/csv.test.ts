import { describe, expect, it } from "vitest";
import { detectarSeparador, leerCSV } from "./csv";

describe("leerCSV", () => {
  it("lee comas, comillas y comillas escapadas", () => {
    expect(leerCSV('Nombre,Precio\n"Tornillo 1/2, caja",1500\n"Dice ""hola""",5')).toEqual([
      ["Nombre", "Precio"],
      ["Tornillo 1/2, caja", "1500"],
      ['Dice "hola"', "5"],
    ]);
  });
  it("detecta punto y coma (Excel en español) y tabulaciones", () => {
    expect(detectarSeparador("a;b;c")).toBe(";");
    expect(detectarSeparador("a\tb\tc")).toBe("\t");
    expect(leerCSV("a;b\n1;2,5")).toEqual([["a", "b"], ["1", "2,5"]]);
  });
  it("tolera BOM, CRLF, saltos dentro de comillas y última línea sin salto", () => {
    expect(leerCSV('﻿a,b\r\n"x\ny",2\r\n3,4')).toEqual([["a", "b"], ["x\ny", "2"], ["3", "4"]]);
  });
  it("archivo vacío no produce filas", () => {
    expect(leerCSV("")).toEqual([]);
  });
});
