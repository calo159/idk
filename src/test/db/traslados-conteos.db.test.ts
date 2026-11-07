/** Migración 0013: multi-bodega con traslados y conteo físico. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, compra, existencia, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let bodega2: string;
let bodeguero: string;
let vendedor: string;
let p1: string;
let p2: string;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Bodegas SAS", "b@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  bodega2 = (await db.query<{ id: string }>("insert into bodegas (organizacion_id, nombre) values ($1,'Depósito') returning id", [n.orgId])).rows[0]!.id;
  bodeguero = await agregarMiembro(db, n.orgId, "bod@b.co", "bodeguero");
  vendedor = await agregarMiembro(db, n.orgId, "v@b.co", "vendedor");
  p1 = await producto(db, n.orgId, { nombre: "Cemento", precio: 30000 });
  p2 = await producto(db, n.orgId, { nombre: "Arena", precio: 5000 });
  await compra(db, ctx, [{ producto: p1, cantidad: 100, costo: 20000 }, { producto: p2, cantidad: 50, costo: 3000 }]);
});
afterAll(async () => db.close());

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const stock = async (prod: string, b: string) => (await existencia(db, prod, b)).cantidad;
const trasladar = (u: string, lineas: unknown, origen = ctx.bodegaId, destino = bodega2) =>
  como(u, async () => (await db.query<{ id: string }>("select trasladar_inventario($1,$2,$3,$4::jsonb,'prueba') id", [ctx.orgId, origen, destino, JSON.stringify(lineas)])).rows[0]!.id);

describe("traslados entre bodegas", () => {
  it("mueve el stock y la mercancía llega al destino con el costo del origen", async () => {
    await trasladar(bodeguero, [{ producto_id: p1, cantidad: 30 }]);
    expect(await stock(p1, ctx.bodegaId)).toBe(70);
    expect(await stock(p1, bodega2)).toBe(30);
    expect((await existencia(db, p1, bodega2)).costo).toBe(20000);
    // el valor total del inventario no cambia: 100 × 20.000
    const v = await db.query<{ v: string }>("select round(sum(cantidad*costo_promedio),2)::text v from existencias where producto_id=$1", [p1]);
    expect(v.rows[0]!.v).toBe("2000000.00");
  });

  it("queda registrado en el kardex de ambas bodegas y con consecutivo", async () => {
    const m = await db.query<{ tipo: string; bodega_id: string }>(
      "select tipo, bodega_id from movimientos_inventario where documento_tipo='traslado' and producto_id=$1 order by id", [p1]);
    expect(m.rows.map((r) => r.tipo)).toEqual(["traslado_salida", "traslado_entrada"]);
    const n = await db.query<{ numero: string }>("select numero::text from traslados order by numero");
    expect(n.rows[0]!.numero).toBe("1");
  });

  it("es atómico: si una línea no tiene stock, no se mueve nada", async () => {
    const antes = await stock(p2, ctx.bodegaId);
    const e = await mensajeDeError(() =>
      trasladar(bodeguero, [{ producto_id: p2, cantidad: 10 }, { producto_id: p1, cantidad: 9999 }]),
    );
    expect(e).toMatch(/No hay suficiente stock de "Cemento"/);
    expect(await stock(p2, ctx.bodegaId)).toBe(antes);
    expect(await stock(p2, bodega2)).toBe(0);
  });

  it("valida origen distinto de destino, bodegas de otro negocio, cantidades y permisos", async () => {
    expect(await mensajeDeError(() => trasladar(bodeguero, [{ producto_id: p1, cantidad: 1 }], ctx.bodegaId, ctx.bodegaId))).toMatch(/distintas/);
    const otro = await crearNegocio(db, "Otro SAS", "otro@x.co");
    expect(await mensajeDeError(() => trasladar(bodeguero, [{ producto_id: p1, cantidad: 1 }], ctx.bodegaId, otro.bodegaId))).toMatch(/Bodega no existe/);
    expect(await mensajeDeError(() => trasladar(bodeguero, [{ producto_id: p1, cantidad: 0 }]))).toMatch(/mayor a cero/);
    expect(await mensajeDeError(() => trasladar(bodeguero, []))).toMatch(/al menos un producto/);
    expect(await mensajeDeError(() => trasladar(vendedor, [{ producto_id: p1, cantidad: 1 }]))).toMatch(/Sin permiso/);
  });

  it("anular devuelve la mercancía; falla si el destino ya la vendió", async () => {
    const t = await trasladar(bodeguero, [{ producto_id: p1, cantidad: 10 }]);
    expect(await stock(p1, bodega2)).toBe(40);
    await como(ctx.usuarioId, () => db.query("select anular_traslado($1,'se envió por error')", [t]));
    expect(await stock(p1, bodega2)).toBe(30);
    expect(await stock(p1, ctx.bodegaId)).toBe(70);
    expect(await mensajeDeError(() => como(ctx.usuarioId, () => db.query("select anular_traslado($1,'otra vez')", [t])))).toMatch(/ya está anulado/);

    // el destino vende todo lo que recibió → no se puede anular el traslado
    const t2 = await trasladar(bodeguero, [{ producto_id: p2, cantidad: 20 }]);
    const turno = await abrirTurno(db, { ...ctx, usuarioId: vendedor, bodegaId: bodega2 });
    await venta(db, { ...ctx, usuarioId: vendedor, bodegaId: bodega2 }, [{ producto: p2, cantidad: 20, precio: 5000 }], { turno });
    const e = await mensajeDeError(() => como(ctx.usuarioId, () => db.query("select anular_traslado($1,'x')", [t2])));
    expect(e).toMatch(/ya no tiene la mercancía/);
    expect(await stock(p2, ctx.bodegaId)).toBe(30);
  });

  it("el bodeguero no anula traslados; no se escribe directo en la tabla", async () => {
    const t = await trasladar(bodeguero, [{ producto_id: p1, cantidad: 1 }]);
    expect(await mensajeDeError(() => como(bodeguero, () => db.query("select anular_traslado($1,'x')", [t])))).toMatch(/Solo dueño o admin/);
    expect(await mensajeDeError(() => como(bodeguero, () => db.query("insert into traslados (organizacion_id,bodega_origen_id,bodega_destino_id) values ($1,$2,$3)", [ctx.orgId, ctx.bodegaId, bodega2])))).toMatch(/row-level security/);
  });
});

describe("conteo físico", () => {
  let conteo: string;
  const contar = (u: string, c: string, prod: string, cant: number) =>
    como(u, async () => (await db.query<{ d: string }>("select registrar_conteo_producto($1,$2,$3)::text d", [c, prod, cant])).rows[0]!.d);

  it("inicia un conteo con todos los productos de la bodega y no permite dos a la vez", async () => {
    conteo = await como(bodeguero, async () => (await db.query<{ id: string }>("select iniciar_conteo($1,$2,'Conteo de noviembre') id", [ctx.orgId, ctx.bodegaId])).rows[0]!.id);
    const n = await db.query<{ n: string }>("select count(*)::text n from conteos_detalle where conteo_id=$1", [conteo]);
    expect(Number(n.rows[0]!.n)).toBe(2);
    expect(await mensajeDeError(() => como(bodeguero, () => db.query("select iniciar_conteo($1,$2,'Otro')", [ctx.orgId, ctx.bodegaId])))).toMatch(/en curso/);
  });

  it("la diferencia se calcula contra lo que había al contar, no al iniciar", async () => {
    // cemento: el sistema tiene 69 (70 menos el traslado de prueba de 1). Se vende 1 DESPUÉS de iniciar el conteo.
    const v2 = await agregarMiembro(db, ctx.orgId, "v2@b.co", "vendedor");
    const turno = await abrirTurno(db, { ...ctx, usuarioId: v2 });
    await venta(db, { ...ctx, usuarioId: v2 }, [{ producto: p1, cantidad: 1, precio: 30000 }], { turno });
    const sistema = await stock(p1, ctx.bodegaId);
    expect(await contar(bodeguero, conteo, p1, sistema - 3)).toBe("-3.000"); // faltan 3
    const arena = await stock(p2, ctx.bodegaId);
    expect(await contar(bodeguero, conteo, p2, arena + 2)).toBe("2.000"); // sobran 2
  });

  it("cerrar sin aplicar no cambia el inventario; aplicar crea los ajustes con motivo", async () => {
    const antes = await stock(p1, ctx.bodegaId);
    const n = await como(ctx.usuarioId, async () => (await db.query<{ n: number }>("select cerrar_conteo($1, false) n", [conteo])).rows[0]!.n);
    expect(n).toBe(2);
    expect(await stock(p1, ctx.bodegaId)).toBe(antes);

    const c2 = await como(ctx.usuarioId, async () => (await db.query<{ id: string }>("select iniciar_conteo($1,$2,'Segundo') id", [ctx.orgId, ctx.bodegaId])).rows[0]!.id);
    await contar(ctx.usuarioId, c2, p1, antes - 5);
    await como(ctx.usuarioId, () => db.query("select cerrar_conteo($1, true)", [c2]));
    expect(await stock(p1, ctx.bodegaId)).toBe(antes - 5);
    const m = await db.query<{ tipo: string; motivo: string }>("select tipo, motivo from movimientos_inventario where producto_id=$1 order by id desc limit 1", [p1]);
    expect(m.rows[0]).toMatchObject({ tipo: "ajuste_salida" });
    expect(m.rows[0]!.motivo).toMatch(/Conteo físico: Segundo/);
  });

  it("un conteo cerrado no se modifica; solo dueño/admin cierran; el vendedor no cuenta", async () => {
    expect(await mensajeDeError(() => contar(bodeguero, conteo, p1, 1))).toMatch(/ya está cerrado/);
    const c3 = await como(ctx.usuarioId, async () => (await db.query<{ id: string }>("select iniciar_conteo($1,$2,'Tercero') id", [ctx.orgId, bodega2])).rows[0]!.id);
    expect(await mensajeDeError(() => como(bodeguero, () => db.query("select cerrar_conteo($1)", [c3])))).toMatch(/Solo dueño o admin/);
    expect(await mensajeDeError(() => contar(vendedor, c3, p1, 1))).toMatch(/Sin permiso/);
    expect(await mensajeDeError(() => contar(bodeguero, c3, p1, -1))).toMatch(/no es válida/);
    await como(ctx.usuarioId, () => db.query("select cancelar_conteo($1)", [c3]));
  });

  it("un faltante grande genera alerta para el dueño", async () => {
    const cuenta = async () => Number((await db.query<{ n: string }>("select count(*)::text n from alertas where tipo='faltante_inventario'")).rows[0]!.n);
    const antes = await cuenta();
    await db.query("update organizaciones set umbral_ajuste_alerta = 1000 where id = $1", [ctx.orgId]);
    const c = await como(ctx.usuarioId, async () => (await db.query<{ id: string }>("select iniciar_conteo($1,$2,'Grande') id", [ctx.orgId, ctx.bodegaId])).rows[0]!.id);
    await contar(ctx.usuarioId, c, p1, 0);
    await como(ctx.usuarioId, () => db.query("select cerrar_conteo($1,false)", [c]));
    expect(await cuenta()).toBe(antes + 1);
  });
});
