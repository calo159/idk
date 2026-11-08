import { describe, expect, it } from "vitest";
import { emparejarItems, extraerItemsReglas, mensajeRecepcionPedido } from "./extraer";

describe("extraerItemsReglas", () => {
  it("separa por comas con cantidades en dígitos y en palabras", () => {
    expect(extraerItemsReglas("2 cemento gris, tres bolsas de arena, un martillo")).toEqual([
      { descripcion: "cemento gris", cantidad: 2 },
      { descripcion: "arena", cantidad: 3 },
      { descripcion: "martillo", cantidad: 1 },
    ]);
  });
  it("quita saludos y relleno, y entiende unidades y 'y' entre renglones", () => {
    expect(extraerItemsReglas("Hola buenas, necesito 10 metros de cable #12 y 2 cajas de tornillos")).toEqual([
      { descripcion: "cable 12", cantidad: 10 },
      { descripcion: "tornillos", cantidad: 2 },
    ]);
  });
  it("sin cantidad asume 1; media docena y decimales", () => {
    expect(extraerItemsReglas("pintura blanca")).toEqual([{ descripcion: "pintura blanca", cantidad: 1 }]);
    expect(extraerItemsReglas("2,5 kilos de alambre")).toEqual([{ descripcion: "alambre", cantidad: 2.5 }]);
    expect(extraerItemsReglas("media docena de bombillos")[0]).toMatchObject({ descripcion: "bombillos", cantidad: 6 });
  });
  it("renglones vacíos, absurdos o muy largos se ignoran", () => {
    expect(extraerItemsReglas("")).toEqual([]);
    expect(extraerItemsReglas("hola, gracias,")).toEqual([]);
    expect(extraerItemsReglas("999999 cemento")).toEqual([]);
    expect(extraerItemsReglas("a".repeat(5000)).length).toBeLessThanOrEqual(1);
  });
});

describe("emparejarItems", () => {
  const catalogo = [
    { id: "c1", nombre: "Cemento gris 50 kg", precio: 34000 },
    { id: "c2", nombre: "Cemento blanco 5 kg", precio: 18500 },
    { id: "a1", nombre: "Arena de río (bulto)", precio: 6000 },
    { id: "m1", nombre: "Martillo uña 16 oz", precio: 24500 },
    { id: "t1", nombre: "Tornillo drywall 1\" (cien)", precio: 6500 },
    { id: "t2", nombre: "Tornillo drywall 2\" (cien)", precio: 9500 },
  ];
  it("empareja ignorando mayúsculas, tildes y plurales", () => {
    const r = emparejarItems([{ descripcion: "arenas", cantidad: 3 }, { descripcion: "MARTILLO", cantidad: 1 }], catalogo);
    expect(r.lineas).toEqual([
      { producto_id: "a1", nombre: "Arena de río (bulto)", cantidad: 3, precio: 6000 },
      { producto_id: "m1", nombre: "Martillo uña 16 oz", cantidad: 1, precio: 24500 },
    ]);
    expect(r.noEncontrados).toEqual([]);
  });
  it("elige el más específico cuando el cliente da más detalle", () => {
    const r = emparejarItems([{ descripcion: "cemento gris", cantidad: 2 }], catalogo);
    expect(r.lineas[0]).toMatchObject({ producto_id: "c1", cantidad: 2 });
  });
  it("si es ambiguo no adivina: lo deja con candidatos para que decida una persona", () => {
    const r = emparejarItems([{ descripcion: "tornillo drywall", cantidad: 1 }], catalogo);
    expect(r.lineas).toEqual([]);
    expect(r.noEncontrados[0]!.candidatos.map((c) => c.producto_id).sort()).toEqual(["t1", "t2"]);
  });
  it("un producto que no existe queda sin emparejar, sin candidatos inventados", () => {
    const r = emparejarItems([{ descripcion: "unicornio", cantidad: 1 }], catalogo);
    expect(r.noEncontrados).toEqual([{ descripcion: "unicornio", cantidad: 1, candidatos: [] }]);
  });
  it("el mismo producto pedido dos veces suma las cantidades", () => {
    const r = emparejarItems([{ descripcion: "martillo", cantidad: 1 }, { descripcion: "martillos", cantidad: 2 }], catalogo);
    expect(r.lineas).toEqual([{ producto_id: "m1", nombre: "Martillo uña 16 oz", cantidad: 3, precio: 24500 }]);
  });
});

describe("mensajeRecepcionPedido", () => {
  it("lista lo entendido y lo pendiente sin prometer precios", () => {
    const m = mensajeRecepcionPedido("El Puerto", [{ producto_id: "a", nombre: "Arena", cantidad: 3, precio: 6000 }], [{ descripcion: "unicornio", cantidad: 1, candidatos: [] }]);
    expect(m).toContain("• 3 × Arena");
    expect(m).toContain("confirmar contigo: unicornio");
    expect(m).not.toContain("$");
  });
});
