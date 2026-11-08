import { describe, expect, it } from "vitest";
import { mensajeCumpleanos, mensajeInactivo } from "./fidelizacion";

describe("mensajes de fidelización", () => {
  it("cumpleaños: usa el primer nombre y menciona el regalo de puntos con su valor", () => {
    const m = mensajeCumpleanos("Yaneth Ipuana", "Ferretería El Puerto", 50, 10);
    expect(m).toContain("Yaneth");
    expect(m).not.toContain("Ipuana");
    expect(m).toContain("*50 puntos*");
    expect(m).toContain("$ 500");
  });
  it("cumpleaños sin bono no promete nada", () => {
    expect(mensajeCumpleanos("Ana", "N", 0, 10)).not.toContain("puntos");
  });
  it("inactivo: dice los días y los puntos solo si tiene", () => {
    expect(mensajeInactivo("José Pérez", "N", 45, 120, 10)).toContain("Hace 45 días");
    expect(mensajeInactivo("José", "N", 45, 120, 10)).toContain("*120 puntos* ($ 1.200)");
    expect(mensajeInactivo("José", "N", 45, 0, 10)).not.toContain("puntos");
  });
});
