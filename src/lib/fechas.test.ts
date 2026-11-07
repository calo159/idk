import { describe, expect, it } from "vitest";
import {
  diaBogota,
  diasEntre,
  esDiaValido,
  finDiaBogota,
  formatoDiaLargo,
  formatoFecha,
  formatoFechaHora,
  formatoHora,
  haceCuanto,
  inicioDiaBogota,
  partesBogota,
  rangoDias,
  rangoMes,
  sumarDias,
} from "./fechas";

describe("zona America/Bogota (UTC-5)", () => {
  it("23:30 en Bogotá del 7 nov ya es 8 nov en UTC, pero el día de negocio es el 7", () => {
    const instante = new Date("2026-11-08T04:30:00Z"); // 23:30 del 7 en Bogotá
    expect(diaBogota(instante)).toBe("2026-11-07");
    expect(partesBogota(instante).hora).toBe(23);
  });
  it("medianoche Bogotá = 05:00 UTC", () => {
    expect(inicioDiaBogota("2026-11-07").toISOString()).toBe("2026-11-07T05:00:00.000Z");
  });
  it("el fin del día es el inicio del siguiente (límite exclusivo)", () => {
    expect(finDiaBogota("2026-11-07").toISOString()).toBe("2026-11-08T05:00:00.000Z");
  });
  it("una venta a las 00:10 de Bogotá pertenece al día nuevo", () => {
    expect(diaBogota(new Date("2026-11-08T05:10:00Z"))).toBe("2026-11-08");
  });
  it("sin horario de verano: mismo offset en todo el año", () => {
    expect(inicioDiaBogota("2026-07-01").toISOString()).toBe("2026-07-01T05:00:00.000Z");
    expect(inicioDiaBogota("2026-12-31").toISOString()).toBe("2026-12-31T05:00:00.000Z");
  });
});

describe("aritmética de días", () => {
  it("sumarDias cruza mes y año", () => {
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(sumarDias("2028-03-01", -1)).toBe("2028-02-29");
  });
  it("diasEntre", () => {
    expect(diasEntre("2026-11-01", "2026-11-07")).toBe(6);
    expect(diasEntre("2026-11-07", "2026-11-01")).toBe(-6);
  });
  it("rangoDias incluye ambos extremos", () => {
    const r = rangoDias("2026-11-01", "2026-11-07");
    expect(r.desde.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(r.hasta.toISOString()).toBe("2026-11-08T05:00:00.000Z");
  });
  it("rangoMes", () => {
    expect(rangoMes("2026-02-10")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(rangoMes("2028-02-10")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });
  it("valida días", () => {
    expect(esDiaValido("2026-02-29")).toBe(false);
    expect(esDiaValido("2028-02-29")).toBe(true);
    expect(esDiaValido("2026-13-01")).toBe(false);
    expect(esDiaValido("hoy")).toBe(false);
    expect(() => inicioDiaBogota("2026-02-30")).toThrow();
  });
});

describe("formato en español", () => {
  const t = new Date("2026-11-07T19:35:00Z"); // 2:35 p. m. en Bogotá
  it("fecha", () => expect(formatoFecha(t)).toBe("7 nov 2026"));
  it("hora p. m.", () => expect(formatoHora(t)).toBe("2:35 p. m."));
  it("hora a. m. y medianoche", () => {
    expect(formatoHora(new Date("2026-11-07T14:05:00Z"))).toBe("9:05 a. m.");
    expect(formatoHora(new Date("2026-11-08T05:00:00Z"))).toBe("12:00 a. m.");
    expect(formatoHora(new Date("2026-11-07T17:00:00Z"))).toBe("12:00 p. m.");
  });
  it("fecha y hora", () => expect(formatoFechaHora(t)).toBe("7 nov 2026, 2:35 p. m."));
  it("día largo", () => expect(formatoDiaLargo(t)).toBe("sábado 7 de noviembre"));
  it("fechas solo-día (YYYY-MM-DD) no se corren por la zona horaria", () => {
    expect(formatoFecha("2026-11-07")).toBe("7 nov 2026");
  });
});

describe("haceCuanto", () => {
  const ahora = new Date("2026-11-07T19:35:00Z");
  const hace = (ms: number) => new Date(ahora.getTime() - ms);
  it("momento", () => expect(haceCuanto(hace(10_000), ahora)).toBe("hace un momento"));
  it("minutos", () => expect(haceCuanto(hace(5 * 60_000), ahora)).toBe("hace 5 minutos"));
  it("1 minuto", () => expect(haceCuanto(hace(60_000), ahora)).toBe("hace 1 minuto"));
  it("horas", () => expect(haceCuanto(hace(3 * 3_600_000), ahora)).toBe("hace 3 horas"));
  it("ayer", () => expect(haceCuanto(new Date("2026-11-06T15:00:00Z"), ahora)).toBe("ayer"));
  it("días", () =>
    expect(haceCuanto(new Date("2026-10-28T15:00:00Z"), ahora)).toBe("hace 10 días"));
  it("meses", () =>
    expect(haceCuanto(new Date("2026-08-01T15:00:00Z"), ahora)).toBe("hace 3 meses"));
});
