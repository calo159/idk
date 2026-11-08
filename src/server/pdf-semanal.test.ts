import { describe, expect, it } from "vitest";
import type { Resumen } from "@/lib/resumen";
import { pdfSemanal } from "./pdf-semanal";

const r: Resumen = {
  desde: "2026-11-02", hasta: "2026-11-08", ventas: 80, total: 8_400_000, utilidad: 2_100_000, devoluciones: 100000,
  por_metodo: [{ metodo: "efectivo", total: 5_000_000 }], top_productos: [{ nombre: "Cemento gris 50 kg 🧱", cantidad: 40, ingreso: 1_400_000 }],
  pagos_sin_verificar: 2, diferencia_caja: -7000, turnos_abiertos: 0, gastos: 300000, fiado_nuevo: 0, por_cobrar: 450000, alertas_pendientes: 1,
};

describe("pdfSemanal", () => {
  it("genera un PDF válido aunque el nombre del producto tenga emojis", async () => {
    const bytes = await pdfSemanal("Ferretería El Puerto", r, { ...r, total: 7_000_000 });
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1500);
  });
  it("funciona con una semana sin ventas", async () => {
    const bytes = await pdfSemanal("N", { ...r, ventas: 0, total: 0, utilidad: 0, por_metodo: [], top_productos: [] });
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
