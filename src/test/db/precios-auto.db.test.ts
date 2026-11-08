/** Migración 0027: precios sugeridos por margen, aplicación con historial y modo automático. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, compra, producto, proveedor } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let bodeguero: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const sugeridos = () =>
  como(ctx.usuarioId, async () =>
    (await db.query<{ producto: string; costo: string; precio_actual: string; precio_sugerido: string; margen_actual: string; cambio_pct: string }>(
      "select producto, costo::text, precio_actual::text, precio_sugerido::text, margen_actual::text, cambio_pct::text from precios_sugeridos($1)", [ctx.orgId])).rows,
  );
const margen = (id: string, pct: number | null) => db.query("update productos set margen_objetivo=$2 where id=$1", [id, pct]);

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Precios SAS", "p@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@p.co", "vendedor");
  bodeguero = await agregarMiembro(db, n.orgId, "b@p.co", "bodeguero");
});
afterAll(async () => db.close());

describe("redondeo_precio", () => {
  it("sube a $ 100 (o $ 50 si es menor a $ 1.000)", async () => {
    const r = async (n: number) => (await db.query<{ r: string }>("select redondeo_precio($1)::text r", [n])).rows[0]!.r;
    expect(await r(32_001)).toBe("32100");
    expect(await r(32_000)).toBe("32000");
    expect(await r(1_000)).toBe("1000");
    expect(await r(430)).toBe("450");
    expect(await r(999.5)).toBe("1000");
  });
});

describe("precios_sugeridos", () => {
  it("precio = costo / (1 − margen), redondeado hacia arriba", async () => {
    const p = await producto(db, ctx.orgId, { nombre: "Cemento", precio: 30000 });
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 24000 }]);
    await margen(p, 20);
    const f = (await sugeridos()).find((x) => x.producto === "Cemento")!;
    // 24.000 / 0,8 = 30.000 → sin cambio
    expect(f).toMatchObject({ costo: "24000.00", precio_sugerido: "30000", margen_actual: "20.0", cambio_pct: "0.0" });
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 28000 }]); // costo promedio 26.000
    const g = (await sugeridos()).find((x) => x.producto === "Cemento")!;
    expect(g).toMatchObject({ costo: "26000.00", precio_sugerido: "32500", cambio_pct: "8.3", margen_actual: "13.3" });
  });
  it("sin margen objetivo o sin costo conocido no se sugiere nada", async () => {
    const sinMargen = await producto(db, ctx.orgId, { nombre: "Sin margen" });
    await compra(db, ctx, [{ producto: sinMargen, cantidad: 1, costo: 1000 }]);
    const sinCosto = await producto(db, ctx.orgId, { nombre: "Sin costo" });
    await margen(sinCosto, 30);
    const nombres = (await sugeridos()).map((x) => x.producto);
    expect(nombres).not.toContain("Sin margen");
    expect(nombres).not.toContain("Sin costo");
  });
  it("sin stock usa el último costo de compra del proveedor", async () => {
    const p = await producto(db, ctx.orgId, { nombre: "Agotado", precio: 5000 });
    const prov = await proveedor(db, ctx.orgId);
    await compra(db, ctx, [{ producto: p, cantidad: 4, costo: 3000 }], { proveedor: prov });
    await como(ctx.usuarioId, () => db.query("select ajustar_inventario($1,$2,$3,-4,'se vendió todo')", [ctx.orgId, p, ctx.bodegaId]));
    await margen(p, 40);
    expect((await sugeridos()).find((x) => x.producto === "Agotado")).toBeDefined(); // costo viene del historial de compras
  });
  it("solo dueño, admin y contador lo ven", async () => {
    expect(await como(vendedor, () => mensajeDeError(() => db.query("select * from precios_sugeridos($1)", [ctx.orgId])))).toMatch(/Sin permiso/);
  });
});

describe("aplicar_precios", () => {
  it("cambia el precio, guarda historial y auditoría; repetir el mismo precio no hace nada", async () => {
    const p = await producto(db, ctx.orgId, { nombre: "Alambre", precio: 8000 });
    const aplicar = (precio: number) => como(ctx.usuarioId, async () => (await db.query<{ n: number }>("select aplicar_precios($1,$2::jsonb) n", [ctx.orgId, JSON.stringify([{ producto_id: p, precio }])])).rows[0]!.n);
    expect(await aplicar(8500)).toBe(1);
    expect(await aplicar(8500)).toBe(0);
    const h = await db.query<{ precio_anterior: string; precio_nuevo: string }>("select precio_anterior::text, precio_nuevo::text from historial_precios where producto_id=$1", [p]);
    expect(h.rows).toEqual([{ precio_anterior: "8000.00", precio_nuevo: "8500.00" }]);
    expect((await db.query<{ precio_venta: string }>("select precio_venta::text from productos where id=$1", [p])).rows[0]!.precio_venta).toBe("8500.00");
    expect((await db.query("select 1 from auditoria where accion='cambio_precios'")).rows.length).toBeGreaterThan(0);
  });
  it("rechaza precios absurdos (cero, negativos, ×5), y a quien no es dueño/admin", async () => {
    const p = await producto(db, ctx.orgId, { nombre: "Absurdo", precio: 1000 });
    const f = (u: string, precio: number) => como(u, () => mensajeDeError(() => db.query("select aplicar_precios($1,$2::jsonb)", [ctx.orgId, JSON.stringify([{ producto_id: p, precio }])])));
    expect(await f(ctx.usuarioId, 0)).toMatch(/Precio inválido/);
    expect(await f(ctx.usuarioId, -5)).toMatch(/Precio inválido/);
    expect(await f(ctx.usuarioId, 6000)).toMatch(/demasiado grande/);
    expect(await f(bodeguero, 1100)).toMatch(/Solo dueño o admin/);
  });
});

describe("modo automático", () => {
  it("apagado por defecto: no cambia nada; encendido ajusta con tope de ±15 %", async () => {
    const p = await producto(db, ctx.orgId, { nombre: "Auto", precio: 10000 });
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 12000 }]); // sugerido 15.000 con 20 %: +50 %
    await margen(p, 20);
    const correr = () => como(bodeguero, async () => (await db.query<{ n: number }>("select actualizar_precios_automaticos($1) n", [ctx.orgId])).rows[0]!.n);
    expect(await correr()).toBe(0);
    await como(ctx.usuarioId, () => db.query("select configurar_precios_automaticos($1,true)", [ctx.orgId]));
    await correr();
    const precio = async () => Number((await db.query<{ p: string }>("select precio_venta::text p from productos where id=$1", [p])).rows[0]!.p);
    expect(await precio()).toBe(11500); // tope +15 %
    await correr();
    expect(await precio()).toBe(13300); // 11.500 × 1,15 = 13.225 → 13.300 (redondeo hacia arriba); sigue por debajo del sugerido de 15.000
  });
  it("solo dueño o admin lo activan; el vendedor no lo dispara", async () => {
    expect(await como(bodeguero, () => mensajeDeError(() => db.query("select configurar_precios_automaticos($1,false)", [ctx.orgId])))).toMatch(/Solo dueño o admin/);
    expect(await como(vendedor, () => mensajeDeError(() => db.query("select actualizar_precios_automaticos($1)", [ctx.orgId])))).toMatch(/Sin permiso/);
  });
});
