/** Migración 0012: inventario valorizado, ABC, rotación y plata dormida. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, compra, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let pA: string, pB: string, pC: string, pD: string, pE: string;

const hoy = () => db.query<{ d: string }>("select (now() at time zone 'America/Bogota')::date::text d").then((r) => r.rows[0]!.d);
const mover = (id: string, expr: string) =>
  db.transaction(async (tx) => {
    await tx.query("select set_config('surtix.desde_funcion','si',true)");
    await tx.query(`update ventas set creado_en = ${expr} where id = $1`, [id]);
  });

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Inv SAS", "i@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@i.co", "vendedor");
  pA = await producto(db, n.orgId, { nombre: "A grande", precio: 1000 });
  pB = await producto(db, n.orgId, { nombre: "B medio", precio: 1000 });
  pC = await producto(db, n.orgId, { nombre: "C chico", precio: 1000 });
  pD = await producto(db, n.orgId, { nombre: "D dormido", precio: 1000 });
  pE = await producto(db, n.orgId, { nombre: "E nunca vendido", precio: 1000 });
  await compra(db, ctx, [
    { producto: pA, cantidad: 100, costo: 500 }, { producto: pB, cantidad: 100, costo: 500 },
    { producto: pC, cantidad: 100, costo: 500 }, { producto: pD, cantidad: 10, costo: 2000 },
    { producto: pE, cantidad: 5, costo: 4000 },
  ]);
  const vend: Ctx = { ...ctx, usuarioId: vendedor };
  const turno = await abrirTurno(db, vend);
  // ingresos: A 80.000, B 15.000, C 5.000 (total 100.000) → A=80 %, B=15 %, C=5 %
  await venta(db, vend, [{ producto: pA, cantidad: 80, precio: 1000 }], { turno });
  await venta(db, vend, [{ producto: pB, cantidad: 15, precio: 1000 }], { turno });
  await venta(db, vend, [{ producto: pC, cantidad: 5, precio: 1000 }], { turno });
  const vD = await venta(db, vend, [{ producto: pD, cantidad: 1, precio: 1000 }], { turno });
  await mover(vD, "now() - interval '90 days'"); // D se vendió por última vez hace 90 días
});
afterAll(async () => db.close());

const q = async <T extends object>(u: string, sql: string, args: unknown[] = []) =>
  comoUsuario(db, u, async () => (await db.query<T>(sql, args)).rows);

describe("inventario valorizado", () => {
  it("valor = Σ cantidad × costo promedio, solo stock positivo, y ordenado de mayor a menor", async () => {
    const f = await q<{ nombre: string; cantidad: string; valor: string }>(ctx.usuarioId, "select nombre, cantidad::text, valor::text from reporte_inventario_valorizado($1)", [ctx.orgId]);
    const por = Object.fromEntries(f.map((x) => [x.nombre, x]));
    expect(por["A grande"]).toMatchObject({ cantidad: "20.000", valor: "10000.00" }); // 20 × 500
    expect(por["E nunca vendido"]).toMatchObject({ valor: "20000.00" }); // 5 × 4.000
    expect(f[0]!.nombre).toBe("C chico"); // 95 × 500 = 47.500, el de mayor valor inmovilizado
  });
});

describe("ABC", () => {
  it("A suma el 80 %, B hasta el 95 %, C el resto; el que cruza el 80 % sigue siendo A", async () => {
    const f = await q<{ nombre: string; clase: string; participacion: string; acumulado: string }>(
      ctx.usuarioId,
      "select nombre, clase, participacion::text, acumulado::text from reporte_abc($1, (now() at time zone 'America/Bogota')::date - 30, (now() at time zone 'America/Bogota')::date)",
      [ctx.orgId],
    );
    // D se vendió hace 90 días: queda fuera del rango
    expect(f.map((x) => [x.nombre, x.clase])).toEqual([["A grande", "A"], ["B medio", "B"], ["C chico", "C"]]);
    expect(f[0]).toMatchObject({ participacion: "80.00", acumulado: "80.00" });
    expect(f[2]!.acumulado).toBe("100.00");
  });
  it("sin ventas devuelve vacío en vez de dividir por cero", async () => {
    const f = await q(ctx.usuarioId, "select * from reporte_abc($1, '2000-01-01', '2000-01-10')", [ctx.orgId]);
    expect(f).toEqual([]);
  });
});

describe("rotación", () => {
  it("días de inventario = stock / venta diaria; sin ventas queda nulo", async () => {
    const f = await q<{ nombre: string; vendido: string; stock: string; dias_de_inventario: string | null }>(
      ctx.usuarioId,
      "select nombre, vendido::text, stock::text, dias_de_inventario::text from reporte_rotacion($1, (now() at time zone 'America/Bogota')::date - 9, (now() at time zone 'America/Bogota')::date)",
      [ctx.orgId],
    );
    const por = Object.fromEntries(f.map((x) => [x.nombre, x]));
    // B: vendió 15 en 10 días = 1,5/día; stock 85 → 56,7 días
    expect(por["B medio"]).toMatchObject({ vendido: "15.000", stock: "85.000", dias_de_inventario: "56.7" });
    expect(por["E nunca vendido"]!.dias_de_inventario).toBeNull();
    // los que rotan más rápido van primero
    expect(f[0]!.nombre).toBe("A grande");
  });
});

describe("plata dormida", () => {
  it("lista lo que no se vende hace N días o nunca, con su valor inmovilizado", async () => {
    const f = await q<{ nombre: string; valor: string; dias_sin_vender: number | null }>(
      ctx.usuarioId,
      "select nombre, valor::text, dias_sin_vender from reporte_plata_dormida($1, 60)",
      [ctx.orgId],
    );
    expect(f.map((x) => x.nombre)).toEqual(["E nunca vendido", "D dormido"]);
    expect(f[0]).toMatchObject({ valor: "20000.00", dias_sin_vender: null });
    expect(f[1]).toMatchObject({ valor: "18000.00", dias_sin_vender: 90 }); // 9 × 2.000
    void (await hoy());
  });
  it("valida el rango de días", async () => {
    const e = await comoUsuario(db, ctx.usuarioId, () => mensajeDeError(() => db.query("select * from reporte_plata_dormida($1, 3)", [ctx.orgId])));
    expect(e).toMatch(/entre 7 y 730/);
  });
});

describe("permisos", () => {
  it("el vendedor no ve ninguno de estos reportes", async () => {
    for (const s of [
      "select * from reporte_inventario_valorizado($1)",
      "select * from reporte_abc($1, '2026-01-01', '2026-01-31')",
      "select * from reporte_rotacion($1, '2026-01-01', '2026-01-31')",
      "select * from reporte_plata_dormida($1, 60)",
    ]) {
      const e = await comoUsuario(db, vendedor, () => mensajeDeError(() => db.query(s, [ctx.orgId])));
      expect(e, s).toMatch(/Sin permiso/);
    }
  });
});
