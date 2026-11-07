import { describe, expect, it } from "vitest";
import { cupoDisponible, esquemaAbono, esquemaCliente, estadoCartera, puedeFiar } from "./clientes";

const U = "3f2b8c1e-5d4a-4e6f-9a1b-2c3d4e5f6a7b";

describe("cliente", () => {
  const base = {
    nombre: "Juan Pérez",
    documento: "",
    telefono: "311 222 3344",
    fecha_nacimiento: "",
    cupo_credito: "$ 500.000",
    acepta_mensajes: true,
  };
  it("normaliza celular y lee el cupo en pesos", () => {
    const r = esquemaCliente.parse(base);
    expect(r.telefono).toBe("3112223344");
    expect(r.cupo_credito).toBe(500000);
    expect(r.documento).toBeUndefined();
  });
  it("rechaza celular, documento y fecha inválidos", () => {
    expect(esquemaCliente.safeParse({ ...base, telefono: "12" }).success).toBe(false);
    expect(esquemaCliente.safeParse({ ...base, documento: "abc" }).success).toBe(false);
    expect(esquemaCliente.safeParse({ ...base, fecha_nacimiento: "31/02/1990" }).success).toBe(false);
  });
});

describe("abono", () => {
  it("exige monto positivo y método que no sea crédito", () => {
    expect(esquemaAbono.safeParse({ cliente_id: U, monto: "50.000", metodo: "efectivo" }).success).toBe(true);
    expect(esquemaAbono.safeParse({ cliente_id: U, monto: "0", metodo: "efectivo" }).success).toBe(false);
    expect(esquemaAbono.safeParse({ cliente_id: U, monto: "10", metodo: "credito" }).success).toBe(false);
  });
});

describe("cupo y cartera", () => {
  it("cupo disponible nunca es negativo", () => {
    expect(cupoDisponible(100000, 30000).toNumber()).toBe(70000);
    expect(cupoDisponible(100000, 150000).toNumber()).toBe(0);
  });
  it("puedeFiar respeta el cupo exacto y el cupo cero", () => {
    expect(puedeFiar(100000, 60000, 40000)).toBe(true);
    expect(puedeFiar(100000, 60000, 40000.01)).toBe(false);
    expect(puedeFiar(0, 0, 1)).toBe(false);
  });
  it("estado de cartera", () => {
    expect(estadoCartera(100000, 0)).toBe("sin_deuda");
    expect(estadoCartera(100000, 50000)).toBe("al_dia");
    expect(estadoCartera(100000, 80000)).toBe("cerca_del_cupo");
    expect(estadoCartera(100000, 120000)).toBe("excedido");
    expect(estadoCartera(0, 10)).toBe("excedido");
  });
});
