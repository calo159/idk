/** Migración 0015: comparador de proveedores y alertas de alzas. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, compra, producto, proveedor } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let cemento: string;
let provA: string;
let provB: string;
let provC: string;

const comprar = (prov: string, prod: string, costo: number, fecha: string) =>
  compra(db, ctx, [{ producto: prod, cantidad: 10, costo }], { proveedor: prov, fecha });
const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const q = async <T extends object>(sql: string, args: unknown[] = [], u = ctx.usuarioId) => como(u, async () => (await db.query<T>(sql, args)).rows);

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Comparador SAS", "c@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@c.co", "vendedor");
  cemento = await producto(db, n.orgId, { nombre: "Cemento" });
  provA = await proveedor(db, n.orgId);
  provB = await proveedor(db, n.orgId);
  provC = await proveedor(db, n.orgId);
  await comprar(provA, cemento, 30000, "2026-09-01");
  await comprar(provA, cemento, 31000, "2026-10-01"); // A: sube 3,3 %
  await comprar(provB, cemento, 29000, "2026-10-05");
  await comprar(provC, cemento, 36000, "2026-10-10");
});
afterAll(async () => db.close());

describe("comparar_proveedores", () => {
  it("usa el último precio de cada proveedor, del más barato al más caro, con diferencia contra el mejor", async () => {
    const f = await q<{ ultimo_costo: string; compras: string; diferencia_vs_mejor: string; pct_vs_mejor: string; costo_minimo: string }>(
      "select ultimo_costo::text, compras::text, diferencia_vs_mejor::text, pct_vs_mejor::text, costo_minimo::text from comparar_proveedores($1,$2)", [ctx.orgId, cemento]);
    expect(f.map((x) => x.ultimo_costo)).toEqual(["29000.00", "31000.00", "36000.00"]);
    expect(f[0]).toMatchObject({ diferencia_vs_mejor: "0.00", pct_vs_mejor: "0.0" });
    expect(f[1]).toMatchObject({ compras: "2", diferencia_vs_mejor: "2000.00", pct_vs_mejor: "6.9", costo_minimo: "30000.00" });
    expect(f[2]!.pct_vs_mejor).toBe("24.1");
  });
  it("un producto sin historial devuelve vacío; el vendedor no puede comparar", async () => {
    const otro = await producto(db, ctx.orgId);
    expect(await q("select * from comparar_proveedores($1,$2)", [ctx.orgId, otro])).toEqual([]);
    const e = await como(vendedor, () => mensajeDeError(() => db.query("select * from comparar_proveedores($1,$2)", [ctx.orgId, cemento])));
    expect(e).toMatch(/Sin permiso/);
  });
  it("anular la compra quita su precio del historial", async () => {
    const x = await producto(db, ctx.orgId, { nombre: "Efímero" });
    const c = await comprar(provB, x, 1000, "2026-10-20");
    expect(await q("select * from comparar_proveedores($1,$2)", [ctx.orgId, x])).toHaveLength(1);
    await como(ctx.usuarioId, () => db.query("select anular_compra($1,'error')", [c]));
    expect(await q("select * from comparar_proveedores($1,$2)", [ctx.orgId, x])).toEqual([]);
  });
});

describe("alertas de alza", () => {
  it("una subida de 10 % o más frente a la compra anterior del mismo proveedor crea una alerta", async () => {
    const p = await producto(db, ctx.orgId, { nombre: "Varilla" });
    await comprar(provA, p, 20000, "2026-10-01");
    await comprar(provA, p, 20500, "2026-10-15"); // +2,5 %: sin alerta
    expect((await db.query("select 1 from alertas where tipo='alza_precio' and mensaje like '%Varilla%'")).rows).toHaveLength(0);
    await comprar(provA, p, 24000, "2026-10-25"); // +17 %
    const a = await db.query<{ mensaje: string; severidad: string }>("select mensaje, severidad from alertas where tipo='alza_precio' and mensaje like '%Varilla%'");
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]!.mensaje).toMatch(/subió el costo de Varilla un 17 %/);
  });
  it("comprar más caro a OTRO proveedor no cuenta como alza del primero", async () => {
    const p = await producto(db, ctx.orgId, { nombre: "Pintura" });
    await comprar(provA, p, 40000, "2026-10-01");
    await comprar(provB, p, 90000, "2026-10-02");
    expect((await db.query("select 1 from alertas where tipo='alza_precio' and mensaje like '%Pintura%'")).rows).toHaveLength(0);
  });
});

describe("alzas_de_precio (reporte)", () => {
  it("lista las subidas recientes sobre el umbral, de mayor a menor", async () => {
    const hoy = (await db.query<{ d: string }>("select (now() at time zone 'America/Bogota')::date::text d")).rows[0]!.d;
    const p = await producto(db, ctx.orgId, { nombre: "Tubo" });
    await comprar(provC, p, 10000, hoy);
    // segunda compra más cara, en la misma fecha (id mayor)
    await comprar(provC, p, 13000, hoy);
    const f = await q<{ producto: string; pct: string; costo_anterior: string; costo_nuevo: string }>(
      "select producto, pct::text, costo_anterior::text, costo_nuevo::text from alzas_de_precio($1, 30, 5)", [ctx.orgId]);
    expect(f.find((x) => x.producto === "Tubo")).toMatchObject({ pct: "30.0", costo_anterior: "10000.00", costo_nuevo: "13000.00" });
    // el umbral filtra
    const alto = await q<{ producto: string }>("select producto from alzas_de_precio($1, 30, 50)", [ctx.orgId]);
    expect(alto.find((x) => x.producto === "Tubo")).toBeUndefined();
  });
  it("valida días y rol", async () => {
    expect(await como(ctx.usuarioId, () => mensajeDeError(() => db.query("select * from alzas_de_precio($1, 0, 5)", [ctx.orgId])))).toMatch(/entre 1 y 365/);
    expect(await como(vendedor, () => mensajeDeError(() => db.query("select * from alzas_de_precio($1, 30, 5)", [ctx.orgId])))).toMatch(/Sin permiso/);
  });
});
