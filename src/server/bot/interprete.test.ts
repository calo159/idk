import { describe, expect, it } from "vitest";
import { categoriaDesdeTexto, esquemaIntencion, interpretarReglas, leerMontoColoquial } from "./interprete";

describe("leerMontoColoquial", () => {
  it.each([
    ["45 mil", 45000], ["$ 45.000", 45000], ["45000", 45000], ["1,5 millones", 1_500_000], ["medio millón", 500000],
    ["2 millones", 2_000_000], ["120.500", 120500], ["30k", 30000], ["1.250.000 pesos", 1_250_000],
  ])("%s → %i", (texto, esperado) => expect(leerMontoColoquial(texto)).toBe(esperado));
  it("sin número devuelve null", () => {
    expect(leerMontoColoquial("el flete")).toBeNull();
    expect(leerMontoColoquial("0")).toBeNull();
  });
});

describe("interpretarReglas", () => {
  it("confirmaciones y cancelaciones", () => {
    for (const t of ["sí", "Si", "dale", "OK", "confirmo", "listo!"]) expect(interpretarReglas(t).tipo, t).toBe("confirmar");
    for (const t of ["no", "cancela", "mejor no", "No."]) expect(interpretarReglas(t).tipo, t).toBe("cancelar");
  });
  it("ventas por periodo", () => {
    expect(interpretarReglas("¿Cuánto vendí hoy?")).toEqual({ tipo: "ventas", periodo: "hoy" });
    expect(interpretarReglas("ventas de ayer")).toEqual({ tipo: "ventas", periodo: "ayer" });
    expect(interpretarReglas("cómo van las ventas de la semana")).toEqual({ tipo: "ventas", periodo: "semana" });
    expect(interpretarReglas("cuánto he facturado este mes")).toEqual({ tipo: "ventas", periodo: "mes" });
  });
  it("deudas generales y de una persona", () => {
    expect(interpretarReglas("¿quién me debe?")).toEqual({ tipo: "deuda", cliente: null });
    expect(interpretarReglas("cuánto debe don Pedro")).toEqual({ tipo: "deuda", cliente: "pedro" });
    expect(interpretarReglas("deuda de Yaneth")).toEqual({ tipo: "deuda", cliente: "yaneth" });
  });
  it("stock", () => {
    expect(interpretarReglas("stock de cemento gris")).toEqual({ tipo: "stock", producto: "cemento gris" });
    expect(interpretarReglas("cuántos martillos hay")).toEqual({ tipo: "stock", producto: "martillos" });
    expect(interpretarReglas("¿Cuántas quedan de cemento?")).toEqual({ tipo: "stock", producto: "cemento" });
    expect(interpretarReglas("cuántos hay de martillo")).toEqual({ tipo: "stock", producto: "martillo" });
  });
  it("gastos: monto, categoría, método y descripción", () => {
    expect(interpretarReglas("gasté 45 mil en flete de cemento")).toMatchObject({ tipo: "gasto", monto: 45000, categoria: "Transporte y fletes", metodo: "efectivo" });
    expect(interpretarReglas("pagué la luz 120.000 por nequi")).toMatchObject({ tipo: "gasto", monto: 120000, categoria: "Servicios públicos", metodo: "nequi" });
    const g = interpretarReglas("gasto de 30000 en almuerzo del ayudante");
    expect(g).toMatchObject({ tipo: "gasto", monto: 30000 });
    expect(esquemaIntencion.safeParse(g).success).toBe(true);
  });
  it("un gasto sin monto no se inventa; lo desconocido es 'no_entendido'", () => {
    expect(interpretarReglas("gasté en flete").tipo).toBe("no_entendido");
    expect(interpretarReglas("qué clima hace").tipo).toBe("no_entendido");
    expect(interpretarReglas("   ").tipo).toBe("no_entendido");
  });
  it("saludo muestra la ayuda", () => {
    expect(interpretarReglas("Hola").tipo).toBe("ayuda");
  });
  it("«cuánto debe» no se confunde con ventas", () => {
    expect(interpretarReglas("cuánto debe Pedro de las ventas").tipo).toBe("deuda");
  });
});

describe("categoriaDesdeTexto y esquema", () => {
  it("categoriza por palabras comunes y cae en Otros", () => {
    expect(categoriaDesdeTexto("pagué el arriendo")).toBe("Arriendo");
    expect(categoriaDesdeTexto("compré tinto")).toBe("Alimentación");
    expect(categoriaDesdeTexto("algo raro")).toBe("Otros");
  });
  it("el esquema rechaza montos absurdos y categorías inventadas (lo que podría devolver la IA)", () => {
    expect(esquemaIntencion.safeParse({ tipo: "gasto", monto: -5, categoria: "Otros", descripcion: "x1" }).success).toBe(false);
    expect(esquemaIntencion.safeParse({ tipo: "gasto", monto: 5000, categoria: "Lujos", descripcion: "xx" }).success).toBe(false);
    expect(esquemaIntencion.safeParse({ tipo: "borrar_todo" }).success).toBe(false);
  });
});
