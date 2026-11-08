import { describe, expect, it, vi } from "vitest";
import type { Resumen } from "@/lib/resumen";
import { type RepoBot, type Remitente, responderMensaje } from "./ejecutar";
import { interpretarReglas } from "./interprete";

const quien: Remitente = { org: "org1", usuario: "u1", nombre: "Carlos Pérez", negocio: "Ferretería El Puerto" };
const TEL = "3001112233";
const resumenBase: Resumen = {
  desde: "2026-11-07", hasta: "2026-11-07", ventas: 5, total: 450000, utilidad: 120000, devoluciones: 0, por_metodo: [],
  top_productos: [{ nombre: "Cemento", cantidad: 10, ingreso: 300000 }], pagos_sin_verificar: 0, diferencia_caja: 0,
  turnos_abiertos: 0, gastos: 20000, fiado_nuevo: 0, por_cobrar: 0, alertas_pendientes: 0,
};

function repoFalso(extra: Partial<RepoBot> = {}) {
  let pendiente: { organizacion_id: string; usuario_id: string; accion: unknown } | null = null;
  const repo: RepoBot = {
    resumen: vi.fn(async () => resumenBase),
    buscarProductos: vi.fn(async () => [{ nombre: "Cemento gris", stock: 120, unidad: "unidad" }]),
    buscarClientes: vi.fn(async () => [{ nombre: "Pedro Gómez", saldo: 85000 }]),
    topDeudores: vi.fn(async () => [{ nombre: "Pedro", saldo: 85000, total: 200000 }, { nombre: "Ana", saldo: 115000, total: 200000 }]),
    guardarPendiente: vi.fn(async (_t, org, usuario, accion) => { pendiente = { organizacion_id: org, usuario_id: usuario, accion }; }),
    tomarPendiente: vi.fn(async () => { const p = pendiente; pendiente = null; return p; }),
    registrarGasto: vi.fn(async () => undefined),
    ...extra,
  };
  return repo;
}
const decir = (repo: RepoBot, texto: string, q = quien) => responderMensaje(repo, q, TEL, interpretarReglas(texto), "2026-11-07");

describe("consultas (solo lectura)", () => {
  it("ventas de hoy", async () => {
    const repo = repoFalso();
    const r = await decir(repo, "cuánto vendí hoy");
    expect(r).toContain("*$ 450.000* en 5 venta(s) hoy");
    expect(r).toContain("Utilidad: $ 120.000");
    expect(repo.resumen).toHaveBeenCalledWith("org1", "2026-11-07", "2026-11-07");
  });
  it("ventas de la semana usa 7 días hacia atrás; el mes arranca el día 1", async () => {
    const repo = repoFalso();
    await decir(repo, "ventas de la semana");
    expect(repo.resumen).toHaveBeenLastCalledWith("org1", "2026-11-01", "2026-11-07");
    await decir(repo, "ventas del mes");
    expect(repo.resumen).toHaveBeenLastCalledWith("org1", "2026-11-01", "2026-11-07");
  });
  it("sin ventas lo dice; si la base falla, no inventa números", async () => {
    expect(await decir(repoFalso({ resumen: async () => ({ ...resumenBase, ventas: 0, total: 0 }) }), "ventas de ayer")).toBe("Sin ventas registradas ayer.");
    expect(await decir(repoFalso({ resumen: async () => null }), "ventas de hoy")).toContain("No pude consultar");
  });
  it("stock y deudas", async () => {
    expect(await decir(repoFalso(), "stock de cemento")).toContain("Cemento gris: *120* unidad");
    expect(await decir(repoFalso({ buscarProductos: async () => [] }), "stock de unicornio")).toContain("No encontré");
    expect(await decir(repoFalso(), "cuánto debe pedro")).toContain("Pedro Gómez debe *$ 85.000*");
    const top = await decir(repoFalso(), "quién me debe");
    expect(top).toContain("Te deben *$ 200.000*");
  });
  it("las consultas siempre van con el negocio de quien escribe", async () => {
    const repo = repoFalso();
    await decir(repo, "stock de cemento", { ...quien, org: "otro-negocio" });
    expect(repo.buscarProductos).toHaveBeenCalledWith("otro-negocio", "cemento");
  });
});

describe("gastos con confirmación", () => {
  it("pedir un gasto NO lo guarda: pide confirmación", async () => {
    const repo = repoFalso();
    const r = await decir(repo, "gasté 45 mil en flete");
    expect(r).toContain("*$ 45.000* en Transporte y fletes");
    expect(r).toContain("Responde *SÍ* o *NO*");
    expect(repo.registrarGasto).not.toHaveBeenCalled();
  });
  it("SÍ lo registra con los datos validados; después ya no hay nada pendiente", async () => {
    const repo = repoFalso();
    await decir(repo, "gasté 45 mil en flete");
    expect(await decir(repo, "sí")).toContain("✔ Gasto registrado: $ 45.000");
    expect(repo.registrarGasto).toHaveBeenCalledWith("org1", "u1", expect.objectContaining({ monto: 45000, categoria: "Transporte y fletes", metodo: "efectivo" }));
    expect(await decir(repo, "sí")).toBe("No tengo nada pendiente por confirmar.");
    expect(repo.registrarGasto).toHaveBeenCalledTimes(1);
  });
  it("NO lo descarta", async () => {
    const repo = repoFalso();
    await decir(repo, "pagué la luz 120.000");
    expect(await decir(repo, "no")).toBe("Listo, no registré nada.");
    expect(await decir(repo, "sí")).toBe("No tengo nada pendiente por confirmar.");
    expect(repo.registrarGasto).not.toHaveBeenCalled();
  });
  it("un 'sí' de otra persona o de otro negocio no confirma el gasto ajeno", async () => {
    const repo = repoFalso();
    await decir(repo, "gasté 45 mil en flete");
    expect(await decir(repo, "sí", { ...quien, usuario: "u2" })).toBe("No tengo nada pendiente por confirmar.");
    expect(repo.registrarGasto).not.toHaveBeenCalled();
  });
  it("lo pendiente que venga corrupto de la base no se ejecuta", async () => {
    const repo = repoFalso({ tomarPendiente: async () => ({ organizacion_id: "org1", usuario_id: "u1", accion: { tipo: "gasto", monto: -999, categoria: "Lujos", descripcion: "x" } }) });
    expect(await decir(repo, "sí")).toContain("No pude recuperar");
    expect(repo.registrarGasto).not.toHaveBeenCalled();
  });
  it("si guardar falla, avisa y no dice que quedó registrado", async () => {
    const repo = repoFalso({ registrarGasto: async () => { throw new Error("db"); } });
    await decir(repo, "gasté 45 mil en flete");
    const r = await decir(repo, "sí");
    expect(r).toContain("No pude guardar");
    expect(r).not.toContain("✔");
  });
});

describe("otros", () => {
  it("saludo y mensajes no entendidos muestran la ayuda", async () => {
    expect(await decir(repoFalso(), "hola")).toContain("Hola Carlos");
    expect(await decir(repoFalso(), "cuéntame un chiste")).toContain("No te entendí");
  });
});
