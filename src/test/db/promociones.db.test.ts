/** Migración 0028: promociones de plata dormida. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, compra, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let viejo: string; // 100 días sin venderse
let nuncaVendido: string;
let hoy: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const mas = async (dias: number) => (await db.query<{ d: string }>(`select ((now() at time zone 'America/Bogota')::date + ${dias})::text d`)).rows[0]!.d;
const sugerencias = () =>
  como(ctx.usuarioId, async () =>
    (await db.query<{ producto: string; descuento_pct: string; precio_sugerido: string; costo: string; dias_sin_vender: number | null }>(
      "select producto, descuento_pct::text, precio_sugerido::text, costo::text, dias_sin_vender from sugerir_promociones($1, 60)", [ctx.orgId])).rows,
  );

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Promo SAS", "p@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@p.co", "vendedor");
  hoy = await mas(0);
  viejo = await producto(db, n.orgId, { nombre: "Lámpara vieja", precio: 50000 });
  nuncaVendido = await producto(db, n.orgId, { nombre: "Adorno sin salida", precio: 10000 });
  const casiCosto = await producto(db, n.orgId, { nombre: "Margen mínimo", precio: 10500 });
  await compra(db, ctx, [{ producto: viejo, cantidad: 10, costo: 30000 }, { producto: nuncaVendido, cantidad: 5, costo: 4000 }, { producto: casiCosto, cantidad: 5, costo: 10000 }]);
  const v = { ...ctx, usuarioId: vendedor };
  const turno = await abrirTurno(db, v);
  const id = await venta(db, v, [{ producto: viejo, cantidad: 1, precio: 50000 }], { turno });
  await db.transaction(async (tx) => {
    await tx.query("select set_config('surtix.desde_funcion','si',true)");
    await tx.query("update ventas set creado_en = now() - interval '100 days' where id=$1", [id]);
  });
  const id2 = await venta(db, v, [{ producto: casiCosto, cantidad: 1, precio: 10500 }], { turno });
  await db.transaction(async (tx) => {
    await tx.query("select set_config('surtix.desde_funcion','si',true)");
    await tx.query("update ventas set creado_en = now() - interval '200 days' where id=$1", [id2]);
  });
});
afterAll(async () => db.close());

describe("sugerir_promociones", () => {
  it("el descuento crece con los días sin venderse y nunca baja del costo", async () => {
    const f = Object.fromEntries((await sugerencias()).map((x) => [x.producto, x]));
    // 100 días → 20 %: 50.000 × 0,8 = 40.000 (costo 30.000: ok)
    expect(f["Lámpara vieja"]).toMatchObject({ descuento_pct: "20.0", precio_sugerido: "40000", dias_sin_vender: 100 });
    // nunca vendido → tramo máximo 30 %: 10.000 × 0,7 = 7.000 (costo 4.000)
    expect(f["Adorno sin salida"]).toMatchObject({ descuento_pct: "30.0", precio_sugerido: "7000", dias_sin_vender: null });
    // 200 días → 30 % pedido, pero el margen es de solo 4,8 %: el descuento se limita a ese margen
    expect(Number(f["Margen mínimo"]!.descuento_pct)).toBeLessThan(5);
    expect(Number(f["Margen mínimo"]!.precio_sugerido)).toBeGreaterThanOrEqual(Number(f["Margen mínimo"]!.costo));
  });
  it("valida los días y el rol", async () => {
    expect(await como(ctx.usuarioId, () => mensajeDeError(() => db.query("select * from sugerir_promociones($1, 10)", [ctx.orgId])))).toMatch(/entre 30 y 730/);
    expect(await como(vendedor, () => mensajeDeError(() => db.query("select * from sugerir_promociones($1, 60)", [ctx.orgId])))).toMatch(/Sin permiso/);
  });
});

describe("crear_promocion y vigencia", () => {
  const crear = (items: unknown, desde = hoy, hasta?: string, nombre = "Liquidación") =>
    como(ctx.usuarioId, async () => (await db.query<{ id: string }>("select crear_promocion($1,$2,$3::date,$4::date,$5::jsonb) id", [ctx.orgId, nombre, desde, hasta ?? desde, JSON.stringify(items)])).rows[0]!.id);
  const vigentes = (u = vendedor) => como(u, async () => (await db.query<{ producto_id: string; precio: string }>("select producto_id, precio::text from promociones_vigentes($1)", [ctx.orgId])).rows);

  it("una promoción vigente aparece para todos los usuarios con su precio", async () => {
    const id = await crear([{ producto_id: viejo, precio: 40000 }], hoy, await mas(7));
    expect(await vigentes()).toEqual([{ producto_id: viejo, precio: "40000.00" }]);
    await como(ctx.usuarioId, () => db.query("select desactivar_promocion($1)", [id]));
    expect(await vigentes()).toEqual([]);
  });
  it("una promoción futura o vencida no está vigente", async () => {
    await crear([{ producto_id: viejo, precio: 40000 }], await mas(3), await mas(10), "Futura");
    await crear([{ producto_id: viejo, precio: 40000 }], await mas(-10), await mas(-2), "Vencida");
    expect(await vigentes()).toEqual([]);
  });
  it("con dos promociones del mismo producto vale la más barata", async () => {
    await crear([{ producto_id: viejo, precio: 45000 }], hoy, await mas(5), "A");
    await crear([{ producto_id: viejo, precio: 38000 }], hoy, await mas(5), "B");
    expect(await vigentes()).toEqual([{ producto_id: viejo, precio: "38000.00" }]);
  });
  it("no deja vender bajo el costo, ni más caro que el normal, ni durar más de 120 días", async () => {
    const f = (items: unknown, hasta?: string) => mensajeDeError(() => crear(items, hoy, hasta));
    expect(await f([{ producto_id: viejo, precio: 25000 }])).toMatch(/por debajo de su costo/);
    expect(await f([{ producto_id: viejo, precio: 50000 }])).toMatch(/menor al precio normal/);
    expect(await f([{ producto_id: viejo, precio: 40000 }], await mas(200))).toMatch(/máximo 120 días/);
    expect(await f([])).toMatch(/al menos un producto/);
  });
  it("solo dueño/admin crean; otro negocio no ve las promociones", async () => {
    expect(await como(vendedor, () => mensajeDeError(() => db.query("select crear_promocion($1,'x',current_date,current_date,'[]')", [ctx.orgId])))).toMatch(/Solo dueño o admin/);
    const otro = await crearNegocio(db, "Otro", "otro@x.co");
    expect(await como(otro.duenoId, async () => (await db.query("select * from promociones")).rows)).toEqual([]);
    expect(await como(otro.duenoId, () => mensajeDeError(() => db.query("select * from promociones_vigentes($1)", [ctx.orgId])))).toMatch(/Sin acceso/);
  });
  void nuncaVendido;
});
