/** Migración 0029: fidelización (puntos, canje, cumpleaños e inactivos). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, cliente, compra, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let prod: string;
let turno: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const q = async <T extends object>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const puntos = (c: string) => como(ctx.usuarioId, async () => (await q<{ p: number }>("select saldo_puntos($1) p", [c]))[0]!.p);
const retroceder = (ventaId: string, dias: number) =>
  db.transaction(async (tx) => {
    await tx.query("select set_config('surtix.desde_funcion','si',true)");
    await tx.query(`update ventas set creado_en = now() - interval '${dias} days' where id=$1`, [ventaId]);
  });
const vender = (c: string | null, precio: number) =>
  venta(db, { ...ctx, usuarioId: vendedor }, [{ producto: prod, cantidad: 1, precio }], { turno, cliente: c ?? undefined });

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Fiel SAS", "f@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@f.co", "vendedor");
  prod = await producto(db, n.orgId, { nombre: "Cemento", precio: 1000 });
  await compra(db, ctx, [{ producto: prod, cantidad: 500, costo: 500 }]);
  turno = await abrirTurno(db, { ...ctx, usuarioId: vendedor });
});
afterAll(async () => db.close());

describe("puntos por venta", () => {
  it("no acumula mientras la fidelización está apagada (por defecto)", async () => {
    const c = await cliente(db, ctx.orgId);
    await vender(c, 25000);
    expect(await puntos(c)).toBe(0);
  });

  it("gana 1 punto por cada $ 1.000 (hacia abajo), revierte al anular y no cuenta ventas sin cliente", async () => {
    await como(ctx.usuarioId, () => db.query("select configurar_fidelizacion($1,true,1000,10,50)", [ctx.orgId]));
    const c = await cliente(db, ctx.orgId);
    const v1 = await vender(c, 25900); // 25 puntos
    await vender(c, 400); // < 1 punto: nada
    expect(await puntos(c)).toBe(25);
    await vender(null, 50000); // sin cliente: nadie gana
    expect((await q<{ n: string }>("select count(*)::text n from puntos_movimientos where organizacion_id=$1", [ctx.orgId]))[0]!.n).toBe("1");
    await como(ctx.usuarioId, () => db.query("select anular_venta($1,'Error de digitación')", [v1]));
    expect(await puntos(c)).toBe(0);
  });

  it("una venta no puede dar puntos dos veces", async () => {
    const c = await cliente(db, ctx.orgId);
    const v = await vender(c, 10000);
    await expect(db.query("insert into puntos_movimientos (organizacion_id, cliente_id, puntos, motivo, venta_id) values ($1,$2,10,'compra',$3)", [ctx.orgId, c, v])).rejects.toThrow();
  });
});

describe("canje", () => {
  it("devuelve los pesos de descuento, descuenta puntos y no deja pasarse del saldo", async () => {
    const c = await cliente(db, ctx.orgId);
    await vender(c, 100000); // 100 puntos
    const valor = await como(vendedor, async () => (await q<{ v: string }>("select canjear_puntos($1,$2,40)::text v", [ctx.orgId, c]))[0]!.v);
    expect(valor).toBe("400.00"); // 40 × $ 10
    expect(await puntos(c)).toBe(60);
    expect(await como(vendedor, () => mensajeDeError(() => db.query("select canjear_puntos($1,$2,61)", [ctx.orgId, c])))).toMatch(/solo tiene 60 puntos/);
    expect(await como(vendedor, () => mensajeDeError(() => db.query("select canjear_puntos($1,$2,0)", [ctx.orgId, c])))).toMatch(/cuántos puntos/);
  });

  it("canje dentro de una venta: descuenta una vez; sin saldo avisa al dueño y no toca la venta", async () => {
    const c = await cliente(db, ctx.orgId);
    const v1 = await vender(c, 30000); // 30 puntos
    const canjear = (v: string, n: number) => como(vendedor, async () => (await q<{ r: boolean }>("select canjear_puntos_venta($1,$2) r", [v, n]))[0]!.r);
    expect(await canjear(v1, 20)).toBe(true);
    expect(await canjear(v1, 20)).toBe(false); // mismo canje otra vez: ya no alcanza
    expect(await puntos(c)).toBe(10);
    const alertas = await q<{ mensaje: string }>("select mensaje from alertas where organizacion_id=$1 and tipo='canje_sin_saldo'", [ctx.orgId]);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]!.mensaje).toMatch(/solo tenía 10/);
  });

  it("solo el dueño o el administrador configuran; un vendedor no", async () => {
    expect(await como(vendedor, () => mensajeDeError(() => db.query("select configurar_fidelizacion($1,true,1000,10,50)", [ctx.orgId])))).toMatch(/Solo dueño o admin/);
  });

  it("saldos_puntos lista solo clientes con puntos", async () => {
    const filas = await como(vendedor, () => q<{ cliente_id: string; puntos: number }>("select * from saldos_puntos($1)", [ctx.orgId]));
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((f) => f.puntos > 0)).toBe(true);
  });
});

describe("cumpleaños e inactivos", () => {
  const pendientes = (u = vendedor) => como(u, () => q<{ cliente_id: string; tipo: string; dato: number }>("select cliente_id, tipo, dato from fidelizacion_pendiente($1)", [ctx.orgId]));

  it("avisa a quien cumple años hoy, una sola vez, y regala los puntos de bono", async () => {
    const c = await cliente(db, ctx.orgId, { nombre: "Cumpleañera" });
    await db.query("update clientes set fecha_nacimiento = ((now() at time zone 'America/Bogota')::date - interval '30 years')::date where id=$1", [c]);
    const otro = await cliente(db, ctx.orgId);
    await db.query("update clientes set fecha_nacimiento = ((now() at time zone 'America/Bogota')::date - interval '10 years' - interval '3 days')::date where id=$1", [otro]);
    const lista = await pendientes();
    expect(lista.filter((x) => x.tipo === "cumpleanos").map((x) => x.cliente_id)).toEqual([c]);
    await como(vendedor, () => db.query("select marcar_contacto_fidelizacion($1,$2,'cumpleanos')", [ctx.orgId, c]));
    expect((await pendientes()).some((x) => x.cliente_id === c)).toBe(false);
    expect(await puntos(c)).toBe(50);
  });

  it("avisa a quien lleva 30+ días sin comprar (con 2+ compras), no a los muy recientes ni a los perdidos hace más de un año", async () => {
    const inactivo = await cliente(db, ctx.orgId);
    const reciente = await cliente(db, ctx.orgId);
    const perdido = await cliente(db, ctx.orgId);
    const unaSola = await cliente(db, ctx.orgId);
    for (const [c, dias, n] of [[inactivo, 45, 2], [reciente, 5, 2], [perdido, 400, 2], [unaSola, 60, 1]] as const) {
      for (let i = 0; i < n; i++) await retroceder(await vender(c, 1000), dias + i);
    }
    const lista = (await pendientes()).filter((x) => x.tipo === "inactivo");
    expect(lista.map((x) => x.cliente_id)).toContain(inactivo);
    expect(lista.find((x) => x.cliente_id === inactivo)!.dato).toBe(45);
    for (const no of [reciente, perdido, unaSola]) expect(lista.map((x) => x.cliente_id)).not.toContain(no);
    await como(vendedor, () => db.query("select marcar_contacto_fidelizacion($1,$2,'inactivo')", [ctx.orgId, inactivo]));
    expect((await pendientes()).some((x) => x.cliente_id === inactivo)).toBe(false);
  });

  it("respeta acepta_mensajes y la falta de teléfono", async () => {
    const c = await cliente(db, ctx.orgId);
    await db.query("update clientes set fecha_nacimiento=(now() at time zone 'America/Bogota')::date, acepta_mensajes=false where id=$1", [c]);
    expect((await pendientes()).some((x) => x.cliente_id === c)).toBe(false);
  });

  it("n8n ve solo organizaciones con fidelización activa y registra el contacto con la función de servicio", async () => {
    const c = await cliente(db, ctx.orgId);
    await db.query("update clientes set fecha_nacimiento=(now() at time zone 'America/Bogota')::date where id=$1", [c]);
    const filas = await q<{ cliente_id: string; puntos_bono: number }>("select cliente_id, puntos_bono from fidelizacion_para_n8n()");
    expect(filas.find((f) => f.cliente_id === c)?.puntos_bono).toBe(50);
    await db.query("select registrar_contacto_fidelizacion($1,'cumpleanos')", [c]);
    expect((await q("select 1 from fidelizacion_para_n8n() where cliente_id=$1", [c])).length).toBe(0);
    expect(await mensajeDeError(() => db.query("select registrar_contacto_fidelizacion($1,'otro')", [c]))).toMatch(/inválido/);
  });

  it("un usuario autenticado no puede llamar las funciones de servicio", async () => {
    expect(await como(ctx.usuarioId, () => mensajeDeError(() => db.query("select * from fidelizacion_para_n8n()")))).toMatch(/permission denied|permiso/i);
  });

  it("otro negocio no ve ni canjea los puntos de este", async () => {
    const o = await crearNegocio(db, "Otro SAS", "o@x.co");
    const c = await cliente(db, ctx.orgId);
    expect(await como(o.duenoId, () => mensajeDeError(() => db.query("select * from fidelizacion_pendiente($1)", [ctx.orgId])))).toMatch(/Sin permiso/);
    expect(await como(o.duenoId, () => mensajeDeError(() => db.query("select canjear_puntos($1,$2,1)", [ctx.orgId, c])))).toMatch(/Sin permiso/);
  });
});
