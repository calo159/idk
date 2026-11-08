import { describe, expect, it } from "vitest";
import { MEDIDAS, type Razon, esquemaBenchmark, posicion } from "./benchmark";

const razon = (o: Partial<Razon> = {}): Razon => ({ tuyo: 30, p25: 20, mediana: 24, p75: 28, por_debajo: 0.5, por_encima: 0.5, ...o });
const medida = (clave: string) => MEDIDAS.find((m) => m.clave === clave)!;

describe("posicion", () => {
  it("margen (más alto es mejor): cuenta a quienes tienen MENOS que tú", () => {
    expect(posicion(medida("margen"), razon({ por_debajo: 0.88, por_encima: 0 }))).toEqual({ texto: "Mejor que el 88 % de los negocios del grupo", tono: "bien" });
    expect(posicion(medida("margen"), razon({ por_debajo: 0.5, por_encima: 0.5 })).tono).toBe("regular");
    expect(posicion(medida("margen"), razon({ por_debajo: 0.1, por_encima: 0.9 }))).toEqual({ texto: "Solo mejor que el 10 % del grupo", tono: "mal" });
  });
  it("deuda, pérdidas y días de inventario (más bajo es mejor): cuenta a quienes tienen MÁS que tú", () => {
    for (const k of ["vencido", "perdidas", "rotacion"]) {
      expect(posicion(medida(k), razon({ por_debajo: 0.1, por_encima: 0.8 })).tono).toBe("bien");
      expect(posicion(medida(k), razon({ por_debajo: 0.9, por_encima: 0.05 })).tono).toBe("mal");
    }
  });
  it("un empate no infla el resultado (todo el grupo igual a ti = nadie superado)", () => {
    expect(posicion(medida("vencido"), razon({ tuyo: 0, por_debajo: 0, por_encima: 0 }))).toEqual({ texto: "Por debajo de casi todo el grupo", tono: "mal" });
  });
  it("el ticket promedio solo informa, no juzga", () => {
    expect(posicion(medida("ticket"), razon({ por_debajo: 0.8, por_encima: 0.2 }))).toEqual({ texto: "Vendes más por venta que el 80 % del grupo", tono: "neutral" });
    expect(posicion(medida("ticket"), razon({ por_debajo: 0.2, por_encima: 0.8 })).texto).toBe("El 80 % del grupo vende más por venta");
  });
});

describe("formatos", () => {
  it("porcentajes con coma, días enteros y pesos colombianos", () => {
    expect(medida("margen").formato(24.5)).toBe("24,5 %");
    expect(medida("rotacion").formato(41.6)).toBe("42 días");
    expect(medida("ticket").formato(100000)).toBe("$ 100.000");
  });
});

describe("esquemaBenchmark", () => {
  it("lee las tres respuestas posibles de la base de datos", () => {
    expect(esquemaBenchmark.parse({ compartiendo: false, nicho: "ropa" })).toMatchObject({ compartiendo: false });
    expect(esquemaBenchmark.parse({ compartiendo: true, nicho: "ropa", cohorte_insuficiente: true })).toMatchObject({ cohorte_insuficiente: true });
    const r = esquemaBenchmark.parse({ compartiendo: true, nicho: "ropa", negocios: 8, razones: { margen: { tuyo: "30", p25: 20, mediana: 20, p75: 21.25, por_debajo: 0.88, por_encima: 0 } } });
    expect(r.compartiendo && r.razones?.margen?.tuyo).toBe(30);
  });
  it("rechaza respuestas con otra forma", () => {
    expect(esquemaBenchmark.safeParse({ nicho: "x" }).success).toBe(false);
  });
});
