/** Migración 0025: predicción de agotamiento y compra sugerida. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, compra, producto, proveedor, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vend: Ctx;
let vendedor: string;
let turno: string;
let provA: string;
let provB: string;

const sug = async (cobertura = 14, entrega = 3) =>
  comoUsuario(db, ctx.usuarioId, async () =>
    (await db.query<{ producto: string; stock: string; venta_diaria: string; dias_restantes: string | null; sugerida: string; urgencia: string; proveedor: string | null; costo_estimado: string | null; valor_estimado: string }>(
      "select producto, stock::text, venta_diaria::text, dias_restantes::text, sugerida::text, urgencia, proveedor, costo_estimado::text, valor_estimado::text from sugerencia_compras($1,$2,$3)", [ctx.orgId, cobertura, entrega])).rows,
  );
const envejecer = (id: string, dias: number) =>
  db.transaction(async (tx) => {
    await tx.query("select set_config('surtix.desde_funcion','si',true)");
    await tx.query("update ventas set creado_en = now() - ($2 || ' days')::interval where id=$1", [id, String(dias)]);
  });
/** Vende `cant` unidades hace `dias` días. */
const vender = async (p: string, cant: number, dias: number) => {
  const v = await venta(db, vend, [{ producto: p, cantidad: cant, precio: 10000 }], { turno });
  await envejecer(v, dias);
};

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Reposición SAS", "r@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@r.co", "vendedor");
  vend = { ...ctx, usuarioId: vendedor };
  turno = await abrirTurno(db, vend);
  provA = await proveedor(db, n.orgId);
  provB = await proveedor(db, n.orgId);
});
afterAll(async () => db.close());

describe("sugerencia_compras", () => {
  it("un producto que se vende rápido y tiene poco stock sale como crítico, con cuánto comprar", async () => {
    const p = await producto(db, ctx.orgId, { nombre: "Cemento", minimo: 0 });
    await compra(db, ctx, [{ producto: p, cantidad: 60, costo: 20000 }], { proveedor: provA });
    await vender(p, 56, 5); // 56 unidades en los últimos 14 días (y en los 60)
    const f = (await sug()).find((x) => x.producto === "Cemento")!;
    // ritmo = 0,6 × 56/14 + 0,4 × 56/60 = 2,4 + 0,3733 = 2,7733/día · stock 4 · se acaba en 1,4 días
    expect(f).toMatchObject({ stock: "4.000", venta_diaria: "2.7733", dias_restantes: "1.4", urgencia: "critica" });
    // objetivo = 2,7733 × (14 + 3) = 47,15 − 4 = 43,15 → 44
    expect(f.sugerida).toBe("44");
    expect(f).toMatchObject({ proveedor: expect.any(String), costo_estimado: "20000.00", valor_estimado: "880000.00" });
  });
  it("un producto con stock de sobra no se sugiere", async () => {
    const p = await producto(db, ctx.orgId, { nombre: "Sobra" });
    await compra(db, ctx, [{ producto: p, cantidad: 1000, costo: 1000 }]);
    await vender(p, 10, 3);
    expect((await sug()).find((x) => x.producto === "Sobra")).toBeUndefined();
  });
  it("un producto sin ventas en 60 días no se predice (no hay ritmo) aunque no tenga stock", async () => {
    const p = await producto(db, ctx.orgId, { nombre: "Sin rotación" });
    await compra(db, ctx, [{ producto: p, cantidad: 1, costo: 1000 }]);
    expect((await sug()).find((x) => x.producto === "Sin rotación")).toBeUndefined();
  });
  it("el stock mínimo también cuenta: sugiere reponer hasta el mínimo aunque el ritmo sea bajo", async () => {
    const p = await producto(db, ctx.orgId, { nombre: "Con mínimo", minimo: 50 });
    await compra(db, ctx, [{ producto: p, cantidad: 60, costo: 500 }]);
    await vender(p, 20, 40); // ritmo bajo: 0,4 × 20/60 = 0,133/día
    const f = (await sug()).find((x) => x.producto === "Con mínimo")!;
    expect(f).toMatchObject({ stock: "40.000", sugerida: "10", urgencia: "pronto" }); // 50 − 40
  });
  it("elige el proveedor con el último precio más barato", async () => {
    const p = await producto(db, ctx.orgId, { nombre: "Arena" });
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 5000 }], { proveedor: provA, fecha: "2026-10-01" });
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 4200 }], { proveedor: provB, fecha: "2026-10-05" });
    await vender(p, 18, 4);
    const f = (await sug()).find((x) => x.producto === "Arena")!;
    expect(f.costo_estimado).toBe("4200.00");
  });
  it("los críticos van primero y los parámetros se validan; el vendedor no la ve", async () => {
    const orden = (await sug()).map((x) => x.urgencia);
    const primeraNoCritica = orden.indexOf("pronto");
    if (primeraNoCritica >= 0) expect(orden.slice(primeraNoCritica)).not.toContain("critica");
    expect(await comoUsuario(db, ctx.usuarioId, () => mensajeDeError(() => db.query("select * from sugerencia_compras($1, 0, 3)", [ctx.orgId])))).toMatch(/entre 1 y 90/);
    expect(await comoUsuario(db, ctx.usuarioId, () => mensajeDeError(() => db.query("select * from sugerencia_compras($1, 14, 99)", [ctx.orgId])))).toMatch(/entre 0 y 60/);
    expect(await comoUsuario(db, vendedor, () => mensajeDeError(() => db.query("select * from sugerencia_compras($1)", [ctx.orgId])))).toMatch(/Sin permiso/);
  });
});

describe("reposicion_para_resumen (n8n)", () => {
  it("solo service_role; resume críticos, total y valor por negocio con WhatsApp", async () => {
    await db.query("update organizaciones set telefono_whatsapp='3015550100' where id=$1", [ctx.orgId]);
    await db.exec("set role service_role");
    try {
      const f = (await db.query<{ criticos: number; total: number; valor: string; top: { producto: string }[] }>("select criticos, total, valor::text, top from reposicion_para_resumen()")).rows;
      expect(f).toHaveLength(1);
      expect(f[0]!.criticos).toBeGreaterThanOrEqual(1);
      expect(f[0]!.top.map((t) => t.producto)).toContain("Cemento");
    } finally {
      await db.exec("reset role");
    }
    expect(await comoUsuario(db, ctx.usuarioId, () => mensajeDeError(() => db.query("select * from reposicion_para_resumen()")))).toMatch(/permission denied/);
  });
});
