import { describe, expect, it } from "vitest";
import { dentroDeHorarioDeCobro, mensajeRecordatorio } from "./cobranza";

describe("mensajeRecordatorio", () => {
  it("nivel 1: amable, con el primer nombre y el saldo", () => {
    const m = mensajeRecordatorio(1, "Yaneth Ipuana Epieyú", "Ferretería El Puerto", 130000, 1);
    expect(m).toContain("Hola Yaneth");
    expect(m).toContain("*$ 130.000*");
    expect(m).toContain("Ferretería El Puerto");
    expect(m).not.toContain("vencido");
  });
  it("nivel 2 menciona los días de atraso y propone acordar un pago", () => {
    const m = mensajeRecordatorio(2, "José", "N", 50000, 8);
    expect(m).toContain("8 días vencido");
    expect(m).toContain("abono");
  });
  it("nivel 3 sigue siendo respetuoso (sin amenazas)", () => {
    const m = mensajeRecordatorio(3, "Ana María", "N", 90000, 16);
    expect(m).toContain("16 días de atraso");
    expect(m.toLowerCase()).not.toMatch(/demanda|polic|embarg|reporte|deudor moroso/);
  });
});

describe("dentroDeHorarioDeCobro (hora de Bogotá, UTC−5)", () => {
  const bogota = (iso: string) => new Date(`${iso}-05:00`);
  it("de lunes a sábado entre 8 a. m. y 7 p. m.", () => {
    expect(dentroDeHorarioDeCobro(bogota("2026-11-09T10:00:00"))).toBe(true); // lunes
    expect(dentroDeHorarioDeCobro(bogota("2026-11-14T18:59:00"))).toBe(true); // sábado
  });
  it("fuera de hora, antes de las 8 o desde las 7 p. m., no", () => {
    expect(dentroDeHorarioDeCobro(bogota("2026-11-09T07:59:00"))).toBe(false);
    expect(dentroDeHorarioDeCobro(bogota("2026-11-09T19:00:00"))).toBe(false);
  });
  it("los domingos nunca", () => {
    expect(dentroDeHorarioDeCobro(bogota("2026-11-08T11:00:00"))).toBe(false);
  });
});
