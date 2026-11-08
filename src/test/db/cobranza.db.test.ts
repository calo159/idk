/** Migración 0022: deuda vencida (FIFO), puntaje de pago y recordatorios de cobro. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, cliente, compra, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vend: Ctx;
let vendedor: string;
let turno: string;
let p: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const servicio = async <T>(fn: () => Promise<T>) => {
  await db.exec("set role service_role");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
};
const cartera = (id?: string) =>
  como(ctx.usuarioId, async () =>
    (
      await db.query<{ cliente_id: string; saldo: string; vencido: string; dias_mora: number; dias_deuda: number; puntaje: number; categoria: string }>(
        "select cliente_id, saldo::text, vencido::text, dias_mora, dias_deuda, puntaje, categoria from cartera_clientes($1)",
        [ctx.orgId],
      )
    ).rows.filter((x) => !id || x.cliente_id === id),
  );
/** Mueve una venta fiada N días al pasado (los documentos son inmutables salvo con el bypass interno). */
const envejecer = (ventaId: string, dias: number) =>
  db.transaction(async (tx) => {
    await tx.query("select set_config('surtix.desde_funcion','si',true)");
    await tx.query("update ventas set creado_en = now() - ($2 || ' days')::interval where id=$1", [ventaId, String(dias)]);
  });
const fiar = async (cli: string, monto: number) =>
  venta(db, vend, [{ producto: p, cantidad: 1, precio: monto }], { turno, cliente: cli, pagos: [{ metodo: "credito", monto }] });

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Cobranza SAS", "c@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@c.co", "vendedor");
  vend = { ...ctx, usuarioId: vendedor };
  p = await producto(db, n.orgId, { precio: 100000 });
  await compra(db, ctx, [{ producto: p, cantidad: 200, costo: 50000 }]);
  turno = await abrirTurno(db, vend);
});
afterAll(async () => db.close());

describe("deuda vencida y puntaje", () => {
  it("una deuda reciente no está vencida y el cliente es 'bueno'", async () => {
    const c = await cliente(db, ctx.orgId, { cupo: 1_000_000 });
    await fiar(c, 100000);
    expect((await cartera(c))[0]).toMatchObject({ saldo: "100000.00", vencido: "0.00", dias_mora: 0, puntaje: 100, categoria: "bueno" });
  });
  it("una deuda de 45 días lleva 15 días de mora; los abonos pagan primero lo MÁS VIEJO (FIFO)", async () => {
    const c = await cliente(db, ctx.orgId, { cupo: 1_000_000 });
    const vieja = await fiar(c, 80000);
    await fiar(c, 50000);
    await envejecer(vieja, 45);
    let f = (await cartera(c))[0]!;
    expect(f).toMatchObject({ saldo: "130000.00", vencido: "80000.00", dias_mora: 15, dias_deuda: 45 });
    await como(vendedor, () => db.query("select registrar_abono($1, 80000, 'efectivo', $2)", [c, turno]));
    f = (await cartera(c))[0]!;
    expect(f).toMatchObject({ saldo: "50000.00", vencido: "0.00", dias_mora: 0, puntaje: 100 });
  });
  it("mora grande y vieja baja el puntaje a 'malo'", async () => {
    const c = await cliente(db, ctx.orgId, { cupo: 500_000 });
    const v = await fiar(c, 100000);
    await envejecer(v, 100);
    // 100 − 50 (todo vencido) − 30 (>90 días) − 10 (sin abonos en 45 días) = 10
    expect((await cartera(c))[0]).toMatchObject({ puntaje: 10, categoria: "malo", dias_mora: 70 });
  });
  it("un abono parcial reciente mejora el puntaje frente a no abonar", async () => {
    const c = await cliente(db, ctx.orgId, { cupo: 500_000 });
    const v = await fiar(c, 100000);
    await envejecer(v, 100);
    await como(vendedor, () => db.query("select registrar_abono($1, 10000, 'efectivo', $2)", [c, turno]));
    expect((await cartera(c))[0]!.puntaje).toBe(20); // 100 − 50 − 30 (ya no pierde los 10 por falta de abonos)
  });
  it("las deudas anteriores del cuaderno cuentan con su fecha de registro", async () => {
    const c = await cliente(db, ctx.orgId);
    await como(ctx.usuarioId, () => db.query("select registrar_deuda_inicial($1, 70000)", [c]));
    expect((await cartera(c))[0]).toMatchObject({ saldo: "70000.00", vencido: "0.00" });
  });
  it("un cliente sin deuda no aparece en la cartera; puntaje_cliente lo da por bueno", async () => {
    const c = await cliente(db, ctx.orgId);
    expect(await cartera(c)).toEqual([]);
    const r = await como(vendedor, async () => (await db.query<{ puntaje: number; categoria: string }>("select puntaje, categoria from puntaje_cliente($1)", [c])).rows[0]!);
    expect(r).toEqual({ puntaje: 100, categoria: "bueno" });
  });
  it("sólo roles de ventas/dueño/contador ven la cartera; otro negocio no", async () => {
    const bodeguero = await agregarMiembro(db, ctx.orgId, "b@c.co", "bodeguero");
    expect(await como(bodeguero, () => mensajeDeError(() => db.query("select * from cartera_clientes($1)", [ctx.orgId])))).toMatch(/Sin permiso/);
    const otro = await crearNegocio(db, "Ajeno", "ajeno@x.co");
    expect(await como(otro.duenoId, () => mensajeDeError(() => db.query("select * from cartera_clientes($1)", [ctx.orgId])))).toMatch(/Sin permiso/);
  });
});

describe("recordatorios de cobro", () => {
  let c: string;
  const pendientes = () =>
    servicio(async () => (await db.query<{ cliente_id: string; nivel: number; dias_mora: number }>("select cliente_id, nivel, dias_mora from recordatorios_pendientes()")).rows.filter((x) => x.cliente_id === c));
  const enviar = (nivel: number) => servicio(() => db.query("select registrar_recordatorio($1,$2,100000)", [c, nivel]));

  it("escala por días de mora: nivel 1 al primer día, 2 a los 7 y 3 a los 15, sin repetir", async () => {
    c = await cliente(db, ctx.orgId, { cupo: 500_000, telefono: "3112223344" });
    const v = await fiar(c, 100000);
    await envejecer(v, 25);
    expect(await pendientes()).toEqual([]);
    await envejecer(v, 31);
    expect(await pendientes()).toMatchObject([{ nivel: 1, dias_mora: 1 }]);
    await enviar(1);
    expect(await pendientes()).toEqual([]);
    await envejecer(v, 38);
    expect(await pendientes()).toMatchObject([{ nivel: 2 }]);
    await enviar(2);
    expect(await pendientes()).toEqual([]);
    await envejecer(v, 46);
    expect(await pendientes()).toMatchObject([{ nivel: 3 }]);
    await enviar(3);
    expect(await pendientes()).toEqual([]);
  });
  it("respeta a quien no quiere mensajes", async () => {
    const sin = await cliente(db, ctx.orgId, { cupo: 500_000, telefono: "3119998877" });
    const v = await fiar(sin, 50000);
    await envejecer(v, 40);
    await db.query("update clientes set acepta_mensajes = false where id=$1", [sin]);
    const lista = await servicio(async () => (await db.query<{ cliente_id: string }>("select cliente_id from recordatorios_pendientes()")).rows);
    expect(lista.find((x) => x.cliente_id === sin)).toBeUndefined();
  });
  it("solo el service role puede pedir o registrar recordatorios", async () => {
    expect(await como(ctx.usuarioId, () => mensajeDeError(() => db.query("select * from recordatorios_pendientes()")))).toMatch(/permission denied/);
    expect(await como(ctx.usuarioId, () => mensajeDeError(() => db.query("select registrar_recordatorio($1,1,1)", [c])))).toMatch(/permission denied/);
  });
});
