import { describe, expect, it } from "vitest";
import { type Resumen, esquemaResumen, mensajeResumenDia, mensajeSemanal } from "./resumen";

const base: Resumen = {
  desde: "2026-11-07", hasta: "2026-11-07", ventas: 12, total: 1_250_000, utilidad: 310_000, devoluciones: 0,
  por_metodo: [{ metodo: "efectivo", total: 800_000 }, { metodo: "nequi", total: 450_000 }],
  top_productos: [{ nombre: "Cemento gris 50 kg", cantidad: 20, ingreso: 680_000 }, { nombre: "Arena", cantidad: 30, ingreso: 150_000 }],
  pagos_sin_verificar: 0, diferencia_caja: 0, turnos_abiertos: 0, gastos: 0, fiado_nuevo: 0, por_cobrar: 0, alertas_pendientes: 0,
};

describe("mensajeResumenDia", () => {
  it("día normal: ventas, utilidad, métodos, top y caja cuadrada", () => {
    const m = mensajeResumenDia(base, "Ferretería El Puerto");
    expect(m).toContain("Vendiste *$ 1.250.000* en 12 venta(s)");
    expect(m).toContain("Utilidad: $ 310.000");
    expect(m).toContain("Efectivo $ 800.000 · Nequi $ 450.000");
    expect(m).toContain("Cemento gris 50 kg, Arena");
    expect(m).toContain("✔ La caja cuadró");
    expect(m).not.toContain("alerta");
  });
  it("compara con ayer", () => {
    expect(mensajeResumenDia(base, "N", { ...base, total: 1_000_000 })).toContain("▲ 25 %");
    expect(mensajeResumenDia(base, "N", { ...base, total: 2_500_000 })).toContain("▼ 50 %");
  });
  it("destaca faltante, cajas abiertas, pagos sin verificar, gastos y alertas", () => {
    const m = mensajeResumenDia({ ...base, diferencia_caja: -12000, turnos_abiertos: 1, pagos_sin_verificar: 3, gastos: 45000, alertas_pendientes: 2 }, "N");
    expect(m).toContain("🔴 Faltante en caja: $ 12.000");
    expect(m).toContain("1 caja(s) sin cerrar");
    expect(m).toContain("3 pago(s) electrónicos sin verificar");
    expect(m).toContain("Gastos del día: $ 45.000");
    expect(m).toContain("2 alerta(s)");
    expect(m).not.toContain("La caja cuadró");
  });
  it("un día sin ventas avisa en corto", () => {
    const m = mensajeResumenDia({ ...base, ventas: 0, total: 0 }, "N");
    expect(m).toBe("📊 *N* — resumen de hoy\nHoy no hubo ventas registradas.");
  });
});

describe("mensajeSemanal", () => {
  it("dice cuánto ganó, el mejor producto y a qué prestar atención", () => {
    const m = mensajeSemanal({ ...base, diferencia_caja: -5000, por_cobrar: 300000 }, "N", { ...base, total: 1_000_000 });
    expect(m).toContain("Vendiste $ 1.250.000 (▲ 25 %)");
    expect(m).toContain("Tu mejor producto: Cemento gris 50 kg.");
    expect(m).toContain("Ojo con: faltantes de caja por $ 5.000, $ 300.000 por cobrar a clientes.");
  });
  it("sin nada que revisar no inventa advertencias", () => {
    expect(mensajeSemanal(base, "N")).not.toContain("Ojo con");
  });
});

describe("esquemaResumen", () => {
  it("rechaza respuestas incompletas de la base de datos", () => {
    expect(esquemaResumen.safeParse(base).success).toBe(true);
    expect(esquemaResumen.safeParse({ ...base, total: "mucho" }).success).toBe(false);
    expect(esquemaResumen.safeParse({}).success).toBe(false);
  });
});
