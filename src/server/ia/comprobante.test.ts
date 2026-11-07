import { describe, expect, it } from "vitest";
import { ErrorIA } from "./factura";
import { leerComprobante } from "./comprobante";

const img = { base64: "AAAA", tipo: "image/png" as const };

describe("leerComprobante (modelo simulado)", () => {
  it("normaliza monto, entidad y fecha", async () => {
    const c = await leerComprobante(img, async () => ({
      es_comprobante: true,
      entidad: "Nequi",
      monto: "30.000",
      fecha: "2026-11-05T14:30:00-05:00",
      referencia: "M1234567",
      nombre: "JUAN PEREZ",
      confianza: 0.95,
    }));
    expect(c).toMatchObject({ entidad: "nequi", monto: 30000, referencia: "M1234567" });
    expect(c.fecha).toBe("2026-11-05T19:30:00.000Z");
  });
  it("fecha ilegible queda en null en vez de fallar", async () => {
    const c = await leerComprobante(img, async () => ({ es_comprobante: true, fecha: "ayer", confianza: 1 }));
    expect(c.fecha).toBeNull();
    expect(c.monto).toBeNull();
  });
  it("rechaza respuestas sin el campo obligatorio", async () => {
    await expect(leerComprobante(img, async () => ({ monto: 5 }))).rejects.toMatchObject({
      codigo: "respuesta_invalida",
    });
  });
  it("errores del modelo salen como ErrorIA", async () => {
    await expect(
      leerComprobante(img, async () => {
        throw new Error("boom");
      }),
    ).rejects.toBeInstanceOf(ErrorIA);
  });
});
