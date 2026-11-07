import { describe, expect, it } from "vitest";
import { ErrorIA } from "./factura";
import { leerCuaderno } from "./cuaderno";

const img = { base64: "AAAA", tipo: "image/jpeg" as const };

describe("leerCuaderno (modelo simulado)", () => {
  it("normaliza productos y deudas con números en formato colombiano", async () => {
    const c = await leerCuaderno(img, async () => ({
      productos: [{ nombre: " Cemento ", cantidad: "40", precio: "32.500" }, { nombre: "Alambre" }],
      deudas: [{ cliente: "Doña Rosa", monto: "85.000", telefono: "", nota: "fiado de octubre" }, { cliente: "Pedro", monto: 12000.5 }],
      confianza: 0.8,
      advertencias: ["Renglón 7 ilegible"],
    }));
    expect(c.productos[0]).toEqual({ nombre: "Cemento", cantidad: 40, precio: 32500, costo: 0 });
    expect(c.productos[1]).toEqual({ nombre: "Alambre", cantidad: 0, precio: 0, costo: 0 });
    expect(c.deudas[0]).toMatchObject({ cliente: "Doña Rosa", monto: 85000, telefono: null, nota: "fiado de octubre" });
    expect(c.advertencias).toEqual(["Renglón 7 ilegible"]);
  });
  it("acepta cuadernos que solo traen deudas o solo productos", async () => {
    const solo = await leerCuaderno(img, async () => ({ deudas: [{ cliente: "Ana", monto: 5000 }], confianza: 1 }));
    expect(solo.productos).toEqual([]);
    expect(solo.deudas).toHaveLength(1);
  });
  it("rechaza deudas sin monto positivo y respuestas que no son objeto", async () => {
    await expect(leerCuaderno(img, async () => ({ deudas: [{ cliente: "Ana", monto: 0 }], confianza: 1 }))).rejects.toMatchObject({ codigo: "respuesta_invalida" });
    await expect(leerCuaderno(img, async () => "basura")).rejects.toBeInstanceOf(ErrorIA);
  });
  it("un fallo del modelo sale como error controlado", async () => {
    await expect(leerCuaderno(img, async () => { throw new Error("boom"); })).rejects.toMatchObject({ codigo: "modelo" });
  });
  it("descarta campos desconocidos (posible inyección desde la foto)", async () => {
    const c = await leerCuaderno(img, async () => ({ productos: [], deudas: [], confianza: 1, ejecutar: "borrar todo" }));
    expect(c).not.toHaveProperty("ejecutar");
  });
});
