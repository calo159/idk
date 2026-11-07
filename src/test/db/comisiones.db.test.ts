/** Migración 0017: metas y comisiones de vendedores. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, compra, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let maria: string;
let luis: string;
let p: string;
let mes: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const avance = (u: string, fn = "reporte_comisiones") =>
  como(u, async () => (await db.query<{ nombre: string; ventas: string; ventas_netas: string; utilidad_neta: string; meta: string; cumplimiento: string | null; porcentaje: string; comision: string }>(
    `select nombre, ventas::text, ventas_netas::text, utilidad_neta::text, meta::text, cumplimiento::text, porcentaje::text, comision::text from ${fn}($1, $2)`, [ctx.orgId, mes])).rows);

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Comisiones SAS", "c@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  maria = await agregarMiembro(db, n.orgId, "maria@c.co", "vendedor");
  luis = await agregarMiembro(db, n.orgId, "luis@c.co", "vendedor");
  mes = (await db.query<{ m: string }>("select date_trunc('month', now() at time zone 'America/Bogota')::date::text m")).rows[0]!.m;
  p = await producto(db, n.orgId, { precio: 10000 });
  await compra(db, ctx, [{ producto: p, cantidad: 500, costo: 6000 }]);
  const tm = await abrirTurno(db, { ...ctx, usuarioId: maria });
  const tl = await abrirTurno(db, { ...ctx, usuarioId: luis });
  // María: 30 × 10.000 = 300.000 (utilidad 120.000) · Luis: 10 × 10.000 = 100.000 (utilidad 40.000)
  await venta(db, { ...ctx, usuarioId: maria }, [{ producto: p, cantidad: 30, precio: 10000 }], { turno: tm });
  await venta(db, { ...ctx, usuarioId: luis }, [{ producto: p, cantidad: 10, precio: 10000 }], { turno: tl });
});
afterAll(async () => db.close());

describe("sin reglas", () => {
  it("lista a cada vendedor con sus ventas y comisión cero", async () => {
    const f = await avance(ctx.usuarioId);
    const m = f.find((x) => x.nombre.startsWith("maria"))!;
    expect(m).toMatchObject({ ventas: "1", ventas_netas: "300000.00", utilidad_neta: "120000.00", meta: "0.00", comision: "0.00" });
    expect(m.cumplimiento).toBeNull();
  });
});

describe("metas y comisiones", () => {
  it("comisión general del 2 % sobre ventas, con meta y bono de 1 punto al cumplirla", async () => {
    await como(ctx.usuarioId, () => db.query("select fijar_comision($1, null, 'ventas', 2, 1)", [ctx.orgId]));
    await como(ctx.usuarioId, () => db.query("select fijar_meta($1,$2,$3,250000)", [ctx.orgId, maria, mes]));
    await como(ctx.usuarioId, () => db.query("select fijar_meta($1,$2,$3,200000)", [ctx.orgId, luis, mes]));
    const f = await avance(ctx.usuarioId);
    const m = f.find((x) => x.nombre.startsWith("maria"))!;
    const l = f.find((x) => x.nombre.startsWith("luis"))!;
    // María cumplió (300k ≥ 250k): 3 % de 300.000 = 9.000 · Luis no (100k < 200k): 2 % de 100.000 = 2.000
    expect(m).toMatchObject({ cumplimiento: "120.0", porcentaje: "3.00", comision: "9000.00" });
    expect(l).toMatchObject({ cumplimiento: "50.0", porcentaje: "2.00", comision: "2000.00" });
  });

  it("una regla personal reemplaza a la general y puede basarse en la utilidad", async () => {
    await como(ctx.usuarioId, () => db.query("select fijar_comision($1,$2,'utilidad',10,0)", [ctx.orgId, luis]));
    const l = (await avance(ctx.usuarioId)).find((x) => x.nombre.startsWith("luis"))!;
    expect(l).toMatchObject({ porcentaje: "10.00", comision: "4000.00" }); // 10 % de la utilidad 40.000
    // volver a fijarla actualiza (no duplica)
    await como(ctx.usuarioId, () => db.query("select fijar_comision($1,$2,'utilidad',15,0)", [ctx.orgId, luis]));
    expect((await db.query<{ n: string }>("select count(*)::text n from config_comisiones where usuario_id=$1", [luis])).rows[0]!.n).toBe("1");
  });

  it("las devoluciones restan de las ventas netas y de la comisión", async () => {
    const turno = (await db.query<{ id: string }>("select id from turnos_caja where usuario_id=$1", [maria])).rows[0]!.id;
    const v = (await db.query<{ id: string }>("select id from ventas where usuario_id=$1", [maria])).rows[0]!.id;
    const det = (await db.query<{ id: string }>("select id from ventas_detalle where venta_id=$1", [v])).rows[0]!.id;
    // devuelve 10 de 30 (= 100.000 de venta, 40.000 de utilidad): netas 200.000 → ya no llega a la meta (250.000)
    await como(maria, () => db.query("select registrar_devolucion_cliente($1,$2::jsonb,'Cliente se arrepintió','nequi')", [v, JSON.stringify([{ venta_detalle_id: det, cantidad: 10 }])]));
    void turno;
    const m = (await avance(ctx.usuarioId)).find((x) => x.nombre.startsWith("maria"))!;
    expect(m).toMatchObject({ ventas_netas: "200000.00", utilidad_neta: "80000.00", porcentaje: "2.00", comision: "4000.00" });
  });
});

describe("visibilidad y permisos", () => {
  it("cada vendedor ve solo su avance; no puede ver el reporte general", async () => {
    const mio = await avance(maria, "mi_avance_mes");
    expect(mio).toHaveLength(1);
    expect(mio[0]!.nombre).toMatch(/^maria/);
    expect(await como(maria, () => mensajeDeError(() => db.query("select * from reporte_comisiones($1,$2)", [ctx.orgId, mes])))).toMatch(/Sin permiso/);
  });
  it("solo dueño/admin fijan metas y reglas; se validan los rangos", async () => {
    expect(await como(maria, () => mensajeDeError(() => db.query("select fijar_meta($1,$2,$3,1)", [ctx.orgId, maria, mes])))).toMatch(/Solo dueño o admin/);
    expect(await como(maria, () => mensajeDeError(() => db.query("select fijar_comision($1,null,'ventas',50)", [ctx.orgId])))).toMatch(/Solo dueño o admin/);
    const f = (sql: string) => como(ctx.usuarioId, () => mensajeDeError(() => db.query(sql, [ctx.orgId])));
    expect(await f("select fijar_comision($1,null,'ventas',150)")).toMatch(/entre 0 y 100/);
    expect(await f("select fijar_comision($1,null,'ganancia',5)")).toMatch(/ventas o utilidad/);
    expect(await f("select fijar_meta($1, gen_random_uuid(), current_date, 100)")).toMatch(/no pertenece/);
  });
  it("otro negocio no ve ni las metas ni las comisiones de este", async () => {
    const otro = await crearNegocio(db, "Curioso", "curioso@x.co");
    expect(await como(otro.duenoId, () => mensajeDeError(() => db.query("select * from reporte_comisiones($1,$2)", [ctx.orgId, mes])))).toMatch(/Sin permiso/);
    expect(await como(otro.duenoId, async () => (await db.query("select * from metas_vendedor where organizacion_id=$1", [ctx.orgId])).rows)).toEqual([]);
  });
  it("el vendedor ve su propia meta pero no la de otro", async () => {
    const filas = await como(maria, async () => (await db.query<{ usuario_id: string }>("select usuario_id from metas_vendedor")).rows);
    expect(filas.map((x) => x.usuario_id)).toEqual([maria]);
  });
});
