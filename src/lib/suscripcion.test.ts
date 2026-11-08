import { describe, expect, it } from "vitest";
import { avisoSuscripcion, bloqueaApp, estadoSeguro } from "./suscripcion";

describe("bloqueaApp", () => {
  it("solo bloquean vencida y suspendida", () => {
    expect((["prueba", "activa", "gracia", "vencida", "suspendida"] as const).map(bloqueaApp)).toEqual([false, false, false, true, true]);
  });
});

describe("avisoSuscripcion", () => {
  it("la prueba avisa solo en los últimos 7 días y se pone urgente en los últimos 3", () => {
    expect(avisoSuscripcion("prueba", 10, null)).toBeNull();
    expect(avisoSuscripcion("prueba", 7, null)).toEqual({ tipo: "info", texto: "Te quedan 7 días de prueba gratis." });
    expect(avisoSuscripcion("prueba", 3, null)?.tipo).toBe("alerta");
    expect(avisoSuscripcion("prueba", 1, null)?.texto).toBe("Te queda 1 día de prueba gratis.");
  });
  it("una suscripción activa avisa 5 días antes de vencer", () => {
    expect(avisoSuscripcion("activa", 20)).toBeNull();
    expect(avisoSuscripcion("activa", 2)?.texto).toBe("Tu suscripción vence en 2 días.");
  });
  it("gracia alerta; vencida tranquiliza sobre los datos; suspendida muestra el motivo", () => {
    expect(avisoSuscripcion("gracia", 0)?.tipo).toBe("alerta");
    expect(avisoSuscripcion("vencida", 0)).toMatchObject({ tipo: "error", texto: expect.stringContaining("datos están guardados") });
    expect(avisoSuscripcion("suspendida", 0, "pago devuelto")?.texto).toBe("Tu cuenta está suspendida: pago devuelto.");
    expect(avisoSuscripcion("suspendida", 0)?.texto).toMatch(/Escríbenos/);
  });
});

describe("estadoSeguro", () => {
  it("un valor desconocido nunca bloquea al cliente", () => {
    expect(estadoSeguro("vencida")).toBe("vencida");
    expect(estadoSeguro("loquesea")).toBe("activa");
    expect(estadoSeguro(undefined)).toBe("activa");
  });
});
