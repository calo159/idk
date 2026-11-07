/** Migración 0014: órdenes de compra, cuentas por pagar y devoluciones a proveedor. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, existencia, producto, proveedor } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let bodeguero: string;
let vendedor: string;
let prov: string;
let p1: string;
let p2: string;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Ordenes SAS", "o@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  bodeguero = await agregarMiembro(db, n.orgId, "b@o.co", "bodeguero");
  vendedor = await agregarMiembro(db, n.orgId, "v@o.co", "vendedor");
  prov = await proveedor(db, n.orgId);
  p1 = await producto(db, n.orgId, { nombre: "Cemento" });
  p2 = await producto(db, n.orgId, { nombre: "Arena" });
});
afterAll(async () => db.close());

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const uno = async <T>(u: string, sql: string, args: unknown[] = []) => como(u, async () => (await db.query<{ r: T }>(sql, args)).rows[0]!.r);
const crearOC = (u = bodeguero, lineas: unknown = [{ producto_id: p1, cantidad: 100, costo: 20000 }, { producto_id: p2, cantidad: 50, costo: 3000 }]) =>
  uno<string>(u, "select crear_orden_compra($1,$2,$3,$4::jsonb) r", [ctx.orgId, prov, ctx.bodegaId, JSON.stringify(lineas)]);
const detalles = async (oc: string) =>
  (await db.query<{ id: string; producto_id: string }>("select id, producto_id from ordenes_compra_detalle where orden_id=$1", [oc])).rows;

describe("órdenes de compra", () => {
  it("crear una OC no mueve el inventario y le asigna número", async () => {
    const oc = await crearOC();
    expect((await existencia(db, p1, ctx.bodegaId)).cantidad).toBe(0);
    const o = await db.query<{ numero: string; estado: string }>("select numero::text, estado from ordenes_compra where id=$1", [oc]);
    expect(o.rows[0]).toMatchObject({ numero: "1", estado: "borrador" });
  });

  it("recibir parcial crea la compra, mueve el stock con el costo de la OC y deja la OC parcial", async () => {
    const oc = await crearOC();
    await uno(bodeguero, "select cambiar_estado_orden($1,'enviada') r", [oc]);
    const [d1] = await detalles(oc);
    const compra = await uno<string>(bodeguero, "select recibir_orden_compra($1,$2::jsonb,'FV-100') r", [oc, JSON.stringify([{ detalle_id: d1!.id, cantidad: 60 }])]);
    expect(compra).toBeTruthy();
    const ex = await existencia(db, d1!.producto_id, ctx.bodegaId);
    expect(ex.cantidad).toBeGreaterThanOrEqual(60);
    const o = await db.query<{ estado: string }>("select estado from ordenes_compra where id=$1", [oc]);
    expect(o.rows[0]!.estado).toBe("recibida_parcial");
    const c = await db.query<{ estado: string; orden_compra_id: string; total: string }>("select estado, orden_compra_id, total::text from compras where id=$1", [compra]);
    expect(c.rows[0]).toMatchObject({ estado: "confirmado", orden_compra_id: oc, total: "1200000.00" });
  });

  it("completar lo pendiente cierra la OC; recibir de más (>10 %) se rechaza", async () => {
    const oc = await crearOC(bodeguero, [{ producto_id: p1, cantidad: 10, costo: 1000 }]);
    const [d] = await detalles(oc);
    expect(await mensajeDeError(() => uno(bodeguero, "select recibir_orden_compra($1,$2::jsonb) r", [oc, JSON.stringify([{ detalle_id: d!.id, cantidad: 12 }])]))).toMatch(/más de lo pedido/);
    await uno(bodeguero, "select recibir_orden_compra($1,$2::jsonb) r", [oc, JSON.stringify([{ detalle_id: d!.id, cantidad: 10 }])]);
    expect((await db.query<{ estado: string }>("select estado from ordenes_compra where id=$1", [oc])).rows[0]!.estado).toBe("recibida");
    expect(await mensajeDeError(() => uno(bodeguero, "select recibir_orden_compra($1,$2::jsonb) r", [oc, JSON.stringify([{ detalle_id: d!.id, cantidad: 1 }])]))).toMatch(/no admite recibos/);
  });

  it("el costo real de la factura reemplaza al de la OC y alimenta el costo promedio", async () => {
    const pX = await producto(db, ctx.orgId, { nombre: "Costo real" });
    const oc = await crearOC(bodeguero, [{ producto_id: pX, cantidad: 10, costo: 1000 }]);
    const [d] = await detalles(oc);
    await uno(bodeguero, "select recibir_orden_compra($1,$2::jsonb) r", [oc, JSON.stringify([{ detalle_id: d!.id, cantidad: 10, costo: 1200 }])]);
    expect((await existencia(db, pX, ctx.bodegaId)).costo).toBe(1200);
  });

  it("validaciones y permisos", async () => {
    expect(await mensajeDeError(() => crearOC(vendedor))).toMatch(/Sin permiso/);
    expect(await mensajeDeError(() => crearOC(bodeguero, []))).toMatch(/al menos un producto/);
    expect(await mensajeDeError(() => crearOC(bodeguero, [{ producto_id: p1, cantidad: 0, costo: 1 }]))).toMatch(/mayor a cero/);
    const oc = await crearOC();
    await uno(bodeguero, "select cambiar_estado_orden($1,'cancelada') r", [oc]);
    expect(await mensajeDeError(() => uno(bodeguero, "select cambiar_estado_orden($1,'enviada') r", [oc]))).toMatch(/No se puede pasar/);
    const [d] = await detalles(oc);
    expect(await mensajeDeError(() => uno(bodeguero, "select recibir_orden_compra($1,$2::jsonb) r", [oc, JSON.stringify([{ detalle_id: d!.id, cantidad: 1 }])]))).toMatch(/no admite recibos/);
    // línea de otra orden
    const otra = await crearOC();
    const [dOtra] = await detalles(otra);
    const oc3 = await crearOC();
    expect(await mensajeDeError(() => uno(bodeguero, "select recibir_orden_compra($1,$2::jsonb) r", [oc3, JSON.stringify([{ detalle_id: dOtra!.id, cantidad: 1 }])]))).toMatch(/no pertenece a esta orden/);
  });
});

describe("cuentas por pagar", () => {
  let cxp: string;
  let compraCredito: string;

  it("recibir a crédito crea la CxP con vencimiento = fecha + días", async () => {
    const oc = await crearOC(bodeguero, [{ producto_id: p1, cantidad: 10, costo: 10000 }]);
    const [d] = await detalles(oc);
    compraCredito = await uno<string>(bodeguero, "select recibir_orden_compra($1,$2::jsonb,'FV-9','credito',45) r", [oc, JSON.stringify([{ detalle_id: d!.id, cantidad: 10 }])]);
    const x = await db.query<{ id: string; monto: string; saldo: string; vence_dias: number }>(
      "select x.id, x.monto::text, x.saldo::text, (x.vence - c.fecha) vence_dias from cuentas_por_pagar x join compras c on c.id = x.compra_id where x.compra_id=$1", [compraCredito]);
    expect(x.rows[0]).toMatchObject({ monto: "100000.00", saldo: "100000.00", vence_dias: 45 });
    cxp = x.rows[0]!.id;
  });

  it("los pagos reducen el saldo y la cuenta se cierra al llegar a cero", async () => {
    await uno(ctx.usuarioId, "select registrar_pago_proveedor($1, 40000, 'transferencia', 'TR-1') r", [cxp]);
    expect((await db.query<{ saldo: string; estado: string }>("select saldo::text, estado from cuentas_por_pagar where id=$1", [cxp])).rows[0]).toEqual({ saldo: "60000.00", estado: "abierta" });
    expect(await mensajeDeError(() => uno(ctx.usuarioId, "select registrar_pago_proveedor($1, 60001, 'efectivo') r", [cxp]))).toMatch(/supera lo que se debe/);
    await uno(ctx.usuarioId, "select registrar_pago_proveedor($1, 60000, 'efectivo') r", [cxp]);
    expect((await db.query<{ saldo: string; estado: string }>("select saldo::text, estado from cuentas_por_pagar where id=$1", [cxp])).rows[0]).toEqual({ saldo: "0.00", estado: "pagada" });
    expect(await mensajeDeError(() => uno(ctx.usuarioId, "select registrar_pago_proveedor($1, 1, 'efectivo') r", [cxp]))).toMatch(/no está abierta/);
  });

  it("no se puede anular una compra con pagos; sin pagos la cuenta se anula con ella", async () => {
    expect(await mensajeDeError(() => como(ctx.usuarioId, () => db.query("select anular_compra($1,'error')", [compraCredito])))).toMatch(/pagos al proveedor/);

    const oc = await crearOC(bodeguero, [{ producto_id: p2, cantidad: 5, costo: 1000 }]);
    const [d] = await detalles(oc);
    const c2 = await uno<string>(bodeguero, "select recibir_orden_compra($1,$2::jsonb,null,'credito',30) r", [oc, JSON.stringify([{ detalle_id: d!.id, cantidad: 5 }])]);
    await como(ctx.usuarioId, () => db.query("select anular_compra($1,'se devolvió todo')", [c2]));
    const x = await db.query<{ estado: string; saldo: string }>("select estado, saldo::text from cuentas_por_pagar where compra_id=$1", [c2]);
    expect(x.rows[0]).toEqual({ estado: "anulada", saldo: "0.00" });
  });

  it("solo dueño/admin pagan a proveedores; la tabla no se escribe directo", async () => {
    const oc = await crearOC(bodeguero, [{ producto_id: p1, cantidad: 1, costo: 5000 }]);
    const [d] = await detalles(oc);
    const c = await uno<string>(bodeguero, "select recibir_orden_compra($1,$2::jsonb,null,'credito') r", [oc, JSON.stringify([{ detalle_id: d!.id, cantidad: 1 }])]);
    const x = (await db.query<{ id: string }>("select id from cuentas_por_pagar where compra_id=$1", [c])).rows[0]!.id;
    expect(await mensajeDeError(() => uno(bodeguero, "select registrar_pago_proveedor($1, 100, 'efectivo') r", [x]))).toMatch(/Solo dueño o admin/);
    // Sin política de UPDATE, el intento no cambia nada (RLS filtra todas las filas).
    await como(bodeguero, () => db.query("update cuentas_por_pagar set saldo = 0 where id=$1", [x]));
    expect((await db.query<{ saldo: string }>("select saldo::text from cuentas_por_pagar where id=$1", [x])).rows[0]!.saldo).toBe("5000.00");
  });
});

describe("devoluciones a proveedor", () => {
  it("saca la mercancía del inventario y abona a la deuda de la compra", async () => {
    const pD = await producto(db, ctx.orgId, { nombre: "Devolvible" });
    const oc = await crearOC(bodeguero, [{ producto_id: pD, cantidad: 20, costo: 1000 }]);
    const [d] = await detalles(oc);
    const compra = await uno<string>(bodeguero, "select recibir_orden_compra($1,$2::jsonb,null,'credito') r", [oc, JSON.stringify([{ detalle_id: d!.id, cantidad: 20 }])]);
    const dev = await uno<string>(bodeguero, "select registrar_devolucion_proveedor($1,$2,$3,$4::jsonb,'Llegó dañado',$5) r", [ctx.orgId, prov, ctx.bodegaId, JSON.stringify([{ producto_id: pD, cantidad: 5 }]), compra]);
    expect((await existencia(db, pD, ctx.bodegaId)).cantidad).toBe(15);
    const t = await db.query<{ total: string }>("select total::text from devoluciones_proveedor where id=$1", [dev]);
    expect(t.rows[0]!.total).toBe("5000.00");
    const x = await db.query<{ saldo: string }>("select saldo::text from cuentas_por_pagar where compra_id=$1", [compra]);
    expect(x.rows[0]!.saldo).toBe("15000.00");
    const mov = await db.query<{ tipo: string }>("select tipo from movimientos_inventario where documento_id=$1", [dev]);
    expect(mov.rows[0]!.tipo).toBe("devolucion_proveedor");
  });

  it("no devuelve más de lo que hay, exige motivo y rol", async () => {
    const args = (lineas: unknown, motivo = "Dañado") => [ctx.orgId, prov, ctx.bodegaId, JSON.stringify(lineas), motivo];
    const sql = "select registrar_devolucion_proveedor($1,$2,$3,$4::jsonb,$5) r";
    expect(await mensajeDeError(() => uno(bodeguero, sql, args([{ producto_id: p2, cantidad: 99999 }])))).toMatch(/No hay suficiente stock/);
    expect(await mensajeDeError(() => uno(bodeguero, sql, args([{ producto_id: p2, cantidad: 1 }], " ")))).toMatch(/motivo/);
    expect(await mensajeDeError(() => uno(vendedor, sql, args([{ producto_id: p2, cantidad: 1 }])))).toMatch(/Sin permiso/);
  });
});
