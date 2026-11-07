import { describe, expect, it } from "vitest";
import { combinarVariantes, listaDesdeTexto, parsearSeriales, precioParaCliente } from "./avanzado";

describe("parsearSeriales", () => {
  it("acepta líneas, comas y puntos y coma; normaliza a mayúsculas y quita espacios", () => {
    const r = parsearSeriales("sn-001\n sn-002 ,sn-003;SN-004\n\n");
    expect(r.seriales).toEqual(["SN-001", "SN-002", "SN-003", "SN-004"]);
  });
  it("separa repetidos e inválidos (muy cortos o con caracteres raros)", () => {
    const r = parsearSeriales("ABC-1, abc-1, ab, X Y Z, ok#1, SERIAL-9");
    expect(r.seriales).toEqual(["ABC-1", "SERIAL-9"]);
    expect(r.repetidos).toEqual(["ABC-1"]);
    expect(r.invalidos).toEqual(["AB", "X Y Z", "OK#1"]);
  });
});

describe("combinarVariantes", () => {
  it("producto cartesiano de tallas y colores, sin vacíos ni repetidos", () => {
    const c = combinarVariantes({ talla: ["S", "M", "M"], color: ["Rojo", " Azul ", ""] });
    expect(c).toHaveLength(4);
    expect(c).toContainEqual({ atributos: { talla: "M", color: "Azul" } });
  });
  it("con un solo atributo, una variante por valor; sin valores no hay nada", () => {
    expect(combinarVariantes({ talla: ["38", "40"] })).toEqual([{ atributos: { talla: "38" } }, { atributos: { talla: "40" } }]);
    expect(combinarVariantes({ talla: [], color: [] })).toEqual([]);
  });
  it("listaDesdeTexto limpia separadores", () => {
    expect(listaDesdeTexto("S, M ;L\nXL,, ")).toEqual(["S", "M", "L", "XL"]);
  });
});

describe("precioParaCliente", () => {
  it("usa el de la lista cuando existe (incluso si es 0) y el base si no", () => {
    expect(precioParaCliente(10000, 8500)).toBe(8500);
    expect(precioParaCliente(10000, 0)).toBe(0);
    expect(precioParaCliente(10000, undefined)).toBe(10000);
    expect(precioParaCliente(10000, null)).toBe(10000);
  });
});
