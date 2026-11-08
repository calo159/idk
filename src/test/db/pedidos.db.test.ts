/** Migración 0024: pedidos de clientes por WhatsApp. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, cliente, compra, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let p: string;
let cli: string;

const servicio = async <T>(fn: () => Promise<T>) => { await db.exec("set role service_role"); try { return await fn(); } finally { await db.exec("reset role"); } };
const lineas = () => JSON.stringify([{ producto_id: p, nombre: "Cemento", cantidad: 2, precio: 30000 }]);
const registrar = (id: string, tel = "3112223344", ls = lineas(), nf = "[]") =>
  servicio(async () => (await db.query<{ pedido_id: string; nuevo: boolean; cliente_id: string | null }>("select * from registrar_pedido_whatsapp($1,$2,$3,'dos de cemento',$4::jsonb,$5::jsonb)", [ctx.orgId, id, tel, ls, nf])).rows[0]!);
const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Pedidos SAS", "p@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@p.co", "vendedor");
  p = await producto(db, n.orgId, { nombre: "Cemento", precio: 30000 });
  await compra(db, ctx, [{ producto: p, cantidad: 100, costo: 20000 }]);
  cli = await cliente(db, n.orgId, { nombre: "Don Pedro", telefono: "3112223344" });
  await db.query("update organizaciones set whatsapp_phone_number_id='1234567890' where id=$1", [n.orgId]);
});
afterAll(async () => db.close());

describe("registrar_pedido_whatsapp", () => {
  it("crea el pedido pendiente, reconoce al cliente por su teléfono y avisa al dueño", async () => {
    const r = await registrar("wamid.P1", "+57 311 222 3344");
    expect(r).toMatchObject({ nuevo: true, cliente_id: cli });
    const e = await db.query<{ payload: { productos: number; cliente_conocido: boolean } }>("select payload from eventos_outbox where tipo='pedido.nuevo'");
    expect(e.rows[0]!.payload).toMatchObject({ productos: 1, cliente_conocido: true });
  });
  it("el mismo mensaje no crea otro pedido ni otro aviso", async () => {
    const antes = (await db.query("select 1 from eventos_outbox where tipo='pedido.nuevo'")).rows.length;
    const r = await registrar("wamid.P1");
    expect(r.nuevo).toBe(false);
    expect((await db.query("select 1 from pedidos_whatsapp")).rows).toHaveLength(1);
    expect((await db.query("select 1 from eventos_outbox where tipo='pedido.nuevo'")).rows).toHaveLength(antes);
  });
  it("un cliente desconocido queda sin cliente_id (no se crean clientes automáticamente)", async () => {
    const r = await registrar("wamid.P2", "3205550000");
    expect(r.cliente_id).toBeNull();
    expect((await db.query("select 1 from clientes where telefono='3205550000'")).rows).toHaveLength(0);
  });
  it("rechaza pedidos vacíos, teléfonos inválidos y datos que no son listas", async () => {
    expect(await mensajeDeError(() => registrar("x1", "3112223344", "[]", "[]"))).toMatch(/vacío/);
    expect(await mensajeDeError(() => registrar("x2", "123"))).toMatch(/Teléfono inválido/);
    expect(await mensajeDeError(() => registrar("x3", "3112223344", "{}", "[]"))).toMatch(/inválidos/);
  });
  it("sólo con productos sin emparejar también se registra, para que una persona lo atienda", async () => {
    const r = await registrar("wamid.P3", "3112223344", "[]", JSON.stringify([{ descripcion: "unicornio", cantidad: 1 }]));
    expect(r.nuevo).toBe(true);
  });
  it("org_por_numero_whatsapp encuentra el negocio del número que recibió el mensaje", async () => {
    const f = await servicio(async () => (await db.query<{ organizacion: string }>("select organizacion from org_por_numero_whatsapp('1234567890')")).rows);
    expect(f).toEqual([{ organizacion: "Pedidos SAS" }]);
    expect(await servicio(async () => (await db.query("select * from org_por_numero_whatsapp('999')")).rows)).toEqual([]);
    expect(await servicio(async () => (await db.query("select * from org_por_numero_whatsapp('')")).rows)).toEqual([]);
  });
  it("sólo el service role puede registrar pedidos", async () => {
    expect(await como(ctx.usuarioId, () => mensajeDeError(() => db.query("select * from registrar_pedido_whatsapp($1,'z','3112223344','x','[]','[]')", [ctx.orgId])))).toMatch(/permission denied/);
  });
});

describe("resolver_pedido_whatsapp", () => {
  it("confirmar con una venta real avisa al cliente con el total; el pedido no se puede resolver dos veces", async () => {
    const { pedido_id } = await registrar("wamid.P4");
    const v = { ...ctx, usuarioId: vendedor };
    const turno = await abrirTurno(db, v);
    const ventaId = await venta(db, v, [{ producto: p, cantidad: 2, precio: 30000 }], { turno });
    await como(vendedor, () => db.query("select resolver_pedido_whatsapp($1,'confirmado',$2)", [pedido_id, ventaId]));
    const e = await db.query<{ payload: { telefono_cliente: string; total: string } }>("select payload from eventos_outbox where tipo='pedido.confirmado'");
    expect(e.rows[0]!.payload).toMatchObject({ telefono_cliente: "3112223344", total: 60000 });
    expect(await como(vendedor, () => mensajeDeError(() => db.query("select resolver_pedido_whatsapp($1,'rechazado',null,'x')", [pedido_id])))).toMatch(/ya fue confirmado/);
  });
  it("no se confirma con una venta inexistente, de otro negocio o sin confirmar", async () => {
    const { pedido_id } = await registrar("wamid.P5");
    expect(await como(vendedor, () => mensajeDeError(() => db.query("select resolver_pedido_whatsapp($1,'confirmado',gen_random_uuid())", [pedido_id])))).toMatch(/no es válida/);
  });
  it("rechazar exige motivo y avisa al cliente", async () => {
    const { pedido_id } = await registrar("wamid.P6");
    expect(await como(vendedor, () => mensajeDeError(() => db.query("select resolver_pedido_whatsapp($1,'rechazado',null,' ')", [pedido_id])))).toMatch(/motivo/);
    await como(vendedor, () => db.query("select resolver_pedido_whatsapp($1,'rechazado',null,'No tenemos ese producto')", [pedido_id]));
    expect((await db.query("select 1 from eventos_outbox where tipo='pedido.rechazado'")).rows).toHaveLength(1);
  });
  it("otro negocio y roles sin permiso no pueden resolver ni ver pedidos", async () => {
    const { pedido_id } = await registrar("wamid.P7");
    const otro = await crearNegocio(db, "Ajeno", "ajeno@x.co");
    expect(await como(otro.duenoId, () => mensajeDeError(() => db.query("select resolver_pedido_whatsapp($1,'rechazado',null,'x')", [pedido_id])))).toMatch(/Pedido no existe/);
    expect(await como(otro.duenoId, async () => (await db.query("select * from pedidos_whatsapp")).rows)).toEqual([]);
    const contador = await agregarMiembro(db, ctx.orgId, "c@p.co", "contador");
    expect(await como(contador, async () => (await db.query("select * from pedidos_whatsapp")).rows)).toEqual([]);
  });
});
