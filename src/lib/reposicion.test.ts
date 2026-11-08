import { describe, expect, it } from "vitest";
import { agruparPorProveedor, mensajeReposicion } from "./reposicion";

describe("mensajeReposicion", () => {
  it("sin nada por reponer no escribe", () => {
    expect(mensajeReposicion("N", 0, 0, 0, [])).toBeNull();
  });
  it("destaca lo crítico, muestra hasta 6 productos y la inversión", () => {
    const top = Array.from({ length: 8 }, (_, i) => ({ producto: `Prod ${i + 1}`, sugerida: 10 + i, unidad: "unidad", dias: i === 0 ? 0.4 : 5 }));
    const m = mensajeReposicion("Ferretería El Puerto", 2, 8, 1_250_000, top)!;
    expect(m).toContain("🔴 2 producto(s) se te acaban");
    expect(m).toContain("• Prod 1: comprar 10 unidad (se acaba hoy)");
    expect(m).toContain("• Prod 6:");
    expect(m).not.toContain("Prod 7");
    expect(m).toContain("…y 2 más.");
    expect(m).toContain("$ 1.250.000");
  });
  it("sin críticos habla de reponer pronto", () => {
    expect(mensajeReposicion("N", 0, 3, 1000, [{ producto: "A", sugerida: 1, unidad: "kilo", dias: null }])).toContain("3 producto(s) para reponer pronto");
  });
});

describe("agruparPorProveedor", () => {
  it("agrupa por proveedor y deja los sin proveedor al final", () => {
    const g = agruparPorProveedor([
      { id: 1, proveedor_id: null }, { id: 2, proveedor_id: "A" }, { id: 3, proveedor_id: "B" }, { id: 4, proveedor_id: "A" },
    ]);
    expect(g.map((x) => [x.proveedor_id, x.items.map((i) => i.id)])).toEqual([["A", [2, 4]], ["B", [3]], [null, [1]]]);
  });
});
