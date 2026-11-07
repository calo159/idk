import { describe, expect, it } from "vitest";
import { combinarMapeos, detectarEncabezado, leerFilas, mapeoHeuristico, mapeoVacio } from "./importar";

describe("mapeo heurístico por encabezados", () => {
  it("reconoce encabezados típicos de un Excel de ferretería", () => {
    const m = mapeoHeuristico(["Código", "Descripción", "Und", "Cant", "Costo", "Precio Venta", "Grupo"]);
    expect(m).toMatchObject({ sku: 0, nombre: 1, unidad: 2, cantidad: 3, costo: 4, precio_venta: 5, categoria: 6 });
  });
  it("'precio venta' gana sobre 'precio' y cada columna se usa una sola vez", () => {
    const m = mapeoHeuristico(["Precio", "Precio venta", "Producto"]);
    expect(m.precio_venta).toBe(1);
    expect(m.nombre).toBe(2);
    const usadas = Object.values(m).filter((v) => v !== null);
    expect(new Set(usadas).size).toBe(usadas.length);
  });
  it("sin sinónimos conocidos deja todo vacío", () => {
    expect(mapeoHeuristico(["xx", "yy"])).toEqual(mapeoVacio());
  });
  it("tolera tildes, mayúsculas y celdas vacías", () => {
    const m = mapeoHeuristico([null, "ARTÍCULO", "Código de Barras", ""]);
    expect(m).toMatchObject({ nombre: 1, codigo_barras: 2 });
  });
});

describe("combinarMapeos", () => {
  it("completa con el heurístico lo que la IA no resolvió y descarta índices fuera de rango o repetidos", () => {
    const ia = { ...mapeoVacio(), nombre: 1, precio_venta: 1, costo: 99 };
    const h = mapeoHeuristico(["Ref", "Producto", "Costo", "Precio venta"]);
    const r = combinarMapeos(ia, h, 4);
    expect(r.nombre).toBe(1);
    expect(r.precio_venta).toBe(3); // el 1 ya estaba usado por nombre
    expect(r.costo).toBe(2); // 99 no existe → heurístico
  });
});

describe("leerFilas", () => {
  const mapeo = { ...mapeoVacio(), nombre: 0, precio_venta: 1, costo: 2, cantidad: 3, codigo_barras: 4, unidad: 5 };
  it("lee números en formato colombiano y normaliza unidades", () => {
    const r = leerFilas([["Cemento 50kg", "$ 32.500", "28.000", "10,5", "7701234567890", "Und"]], mapeo);
    expect(r.errores).toEqual([]);
    expect(r.validas[0]).toMatchObject({
      nombre: "Cemento 50kg", precio_venta: 32500, costo: 28000, cantidad: 10.5, unidad: "unidad",
      codigo_barras: "7701234567890",
    });
  });
  it("reporta cada error con su fila y sigue con las demás", () => {
    const r = leerFilas(
      [
        ["Bueno", 1000, 500, 5, "", ""],
        ["", 1000, 500, 5, "", ""],
        ["Precio malo", "abc", 500, 5, "", ""],
        ["Negativo", -5, 500, 5, "", ""],
        ["Barras mal", 1, 1, 1, "12 34", ""],
      ],
      mapeo,
    );
    expect(r.validas.map((v) => v.nombre)).toEqual(["Bueno"]);
    expect(r.errores.map((e) => e.fila)).toEqual([2, 3, 4, 5]);
  });
  it("omite filas vacías y detecta repetidos por código, SKU o nombre", () => {
    const r = leerFilas(
      [
        ["A", 1, 1, 1, "111111", ""],
        ["", "", "", "", "", ""],
        ["A otra vez", 1, 1, 1, "111111", ""],
        ["Tornillo", 1, 1, 1, "", ""],
        ["TORNILLO", 1, 1, 1, "", ""],
      ],
      mapeo,
    );
    expect(r.validas.map((v) => v.nombre)).toEqual(["A", "Tornillo"]);
    expect(r.repetidas.map((e) => e.fila)).toEqual([3, 5]);
    expect(r.errores).toEqual([]);
  });
  it("sin columna de nombre mapeada no importa nada", () => {
    const r = leerFilas([["x", 1]], { ...mapeoVacio(), precio_venta: 1 });
    expect(r.validas).toEqual([]);
    expect(r.errores).toHaveLength(1);
  });
  it("códigos numéricos de Excel (12345.0) pierden el .0", () => {
    const r = leerFilas([["P", 1, 1, 1, "7701234567890.0", ""]], mapeo);
    expect(r.validas[0]!.codigo_barras).toBe("7701234567890");
  });
});

describe("detectarEncabezado", () => {
  it("salta títulos y filas en blanco hasta la fila con textos", () => {
    const filas = [["INVENTARIO FERRETERÍA"], [], ["Producto", "Precio", "Cant"], ["Cemento", 32500, 10]];
    expect(detectarEncabezado(filas)).toBe(2);
  });
});
