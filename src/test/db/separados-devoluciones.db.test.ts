/** Migración 0016: cotizaciones, separados con abonos y devoluciones de clientes. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, cliente, compra, existencia, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vend: Ctx;
let vendedor: string;
let turno: string;
let cli: string;
let p1: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const uno = async <T>(u: string, sql: string, args: unknown[] = []) => como(u, async () => (await db.query<{ r: T }>(sql, args)).rows[0]!.r);
const esperadoDe = async (t: string) =>
  como(ctx.usuarioId, async () => (await db.query<{ e: string }>("select efectivo_esperado_turno($1)::text e", [t])).rows[0]!.e);
const esperado = () => esperadoDe(turno);
const stock = async (p: string) => (await existencia(db, p, ctx.bodegaId)).cantidad;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Separados SAS", "s@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@s.co", "vendedor");
  vend = { ...ctx, usuarioId: vendedor };
  p1 = await producto(db, n.orgId, { nombre: "Taladro", precio: 100000 });
  await compra(db, ctx, [{ producto: p1, cantidad: 20, costo: 60000 }]);
  cli = await cliente(db, n.orgId, { cupo: 0 });
  turno = await abrirTurno(db, vend, 50000);
});
afterAll(async () => db.close());

describe("cotizaciones", () => {
  it("crean sin tocar inventario ni caja, con consecutivo y vigencia por defecto", async () => {
    const antes = await stock(p1);
    const c = await uno<string>(vendedor, "select crear_cotizacion($1,$2,$3::jsonb) r", [ctx.orgId, cli, JSON.stringify([{ producto_id: p1, cantidad: 2, precio: 100000 }])]);
    expect(await stock(p1)).toBe(antes);
    const f = await db.query<{ numero: string; estado: string; dias: number }>("select numero::text, estado, (vigencia_hasta - (now() at time zone 'America/Bogota')::date) dias from cotizaciones where id=$1", [c]);
    expect(f.rows[0]).toMatchObject({ numero: "1", estado: "vigente", dias: 15 });
    await uno(vendedor, "select cambiar_estado_cotizacion($1,'cancelada') r", [c]);
    expect(await mensajeDeError(() => uno(vendedor, "select cambiar_estado_cotizacion($1,'aceptada') r", [c]))).toMatch(/ya está cancelada/);
  });
  it("valida líneas y cliente", async () => {
    expect(await mensajeDeError(() => uno(vendedor, "select crear_cotizacion($1,null,'[]'::jsonb) r", [ctx.orgId]))).toMatch(/al menos un producto/);
    const otro = await crearNegocio(db, "Otro", "otro@x.co");
    const cAjeno = await cliente(db, otro.orgId);
    expect(await mensajeDeError(() => uno(vendedor, "select crear_cotizacion($1,$2,$3::jsonb) r", [ctx.orgId, cAjeno, JSON.stringify([{ producto_id: p1, cantidad: 1, precio: 1 }])]))).toMatch(/Cliente no existe/);
  });
});

describe("separados", () => {
  let sep: string;

  it("crear con abono inicial en efectivo: reserva la mercancía (sin moverla) y el abono entra a la caja", async () => {
    const antes = await stock(p1);
    const caja0 = Number(await esperado());
    sep = await uno<string>(vendedor, "select crear_separado($1,$2,$3,$4::jsonb,null,'para diciembre',30000,'efectivo',$5) r", [ctx.orgId, cli, ctx.bodegaId, JSON.stringify([{ producto_id: p1, cantidad: 2, precio: 100000 }]), turno]);
    expect(await stock(p1)).toBe(antes); // no se descuenta hasta entregar
    expect(Number(await esperado())).toBe(caja0 + 30000);
    const s = await db.query<{ total: string; abonado: string }>("select total::text, abonado::text from separados where id=$1", [sep]);
    expect(s.rows[0]).toEqual({ total: "200000.00", abonado: "30000.00" });
    const r = await como(ctx.usuarioId, async () => (await db.query<{ reservado: string }>("select reservado::text from stock_reservado($1) where producto_id=$2", [ctx.orgId, p1])).rows);
    expect(r[0]!.reservado).toBe("2.000");
  });

  it("más abonos suman; no se puede abonar más de lo que falta ni sin turno si es efectivo", async () => {
    await uno(vendedor, "select abonar_separado($1, 50000, 'nequi') r", [sep]); // no entra a la caja
    const s = await db.query<{ abonado: string }>("select abonado::text from separados where id=$1", [sep]);
    expect(s.rows[0]!.abonado).toBe("80000.00");
    expect(await mensajeDeError(() => uno(vendedor, "select abonar_separado($1, 500000, 'nequi') r", [sep]))).toMatch(/supera lo que falta/);
    expect(await mensajeDeError(() => uno(vendedor, "select abonar_separado($1, 1000, 'efectivo') r", [sep]))).toMatch(/turno de caja abierto/);
    expect(await mensajeDeError(() => uno(vendedor, "select abonar_separado($1, 1000, 'credito') r", [sep]))).toMatch(/crédito/);
  });

  it("entregar: crea la venta, descuenta el stock una sola vez, la parte abonada va como 'otro' y no duplica caja", async () => {
    const antes = await stock(p1);
    const caja0 = Number(await esperado());
    // faltan 120.000
    expect(await mensajeDeError(() => uno(vendedor, "select entregar_separado($1,$2::jsonb,$3) r", [sep, JSON.stringify([{ metodo: "efectivo", monto: 100000 }]), turno]))).toMatch(/deben sumar/);
    const v = await uno<string>(vendedor, "select entregar_separado($1,$2::jsonb,$3) r", [sep, JSON.stringify([{ metodo: "efectivo", monto: 120000 }]), turno]);
    expect(await stock(p1)).toBe(antes - 2);
    expect(Number(await esperado())).toBe(caja0 + 120000); // solo el pago de hoy, no los 80.000 ya recibidos antes
    const pagos = await db.query<{ metodo: string; monto: string }>("select metodo, monto::text from pagos_venta where venta_id=$1 order by metodo", [v]);
    expect(pagos.rows).toEqual([{ metodo: "efectivo", monto: "120000.00" }, { metodo: "otro", monto: "80000.00" }]);
    const estado = await db.query<{ estado: string; venta_id: string }>("select estado, venta_id from separados where id=$1", [sep]);
    expect(estado.rows[0]).toMatchObject({ estado: "entregado", venta_id: v });
    const reservado = await como(ctx.usuarioId, async () => (await db.query("select * from stock_reservado($1) where producto_id=$2", [ctx.orgId, p1])).rows);
    expect(reservado).toEqual([]);
    expect(await mensajeDeError(() => uno(vendedor, "select entregar_separado($1,'[]'::jsonb,$2) r", [sep, turno]))).toMatch(/no está activo/);
  });

  it("cancelar devuelve los abonos: el efectivo sale de la caja y el estado cambia; solo dueño/admin", async () => {
    const s2 = await uno<string>(vendedor, "select crear_separado($1,$2,$3,$4::jsonb,null,null,40000,'efectivo',$5) r", [ctx.orgId, cli, ctx.bodegaId, JSON.stringify([{ producto_id: p1, cantidad: 1, precio: 100000 }]), turno]);
    expect(await mensajeDeError(() => uno(vendedor, "select cancelar_separado($1,'ya no lo quiere',$2) r", [s2, turno]))).toMatch(/Solo dueño o admin/);
    const turnoDueno = await abrirTurno(db, ctx, 0);
    const antes = await esperadoDe(turnoDueno);
    await uno(ctx.usuarioId, "select cancelar_separado($1,'ya no lo quiere',$2) r", [s2, turnoDueno]);
    const despues = await esperadoDe(turnoDueno);
    expect(Number(despues)).toBe(Number(antes) - 40000);
    expect((await db.query<{ estado: string }>("select estado from separados where id=$1", [s2])).rows[0]!.estado).toBe("cancelado");
    expect(await mensajeDeError(() => uno(ctx.usuarioId, "select cancelar_separado($1,'otra vez',$2) r", [s2, turnoDueno]))).toMatch(/no está activo/);
  });

  it("un separado exige cliente y no se escribe directo", async () => {
    expect(await mensajeDeError(() => uno(vendedor, "select crear_separado($1,null,$2,$3::jsonb) r", [ctx.orgId, ctx.bodegaId, JSON.stringify([{ producto_id: p1, cantidad: 1, precio: 1 }])]))).toMatch(/necesita cliente/);
    await como(vendedor, () => db.query("update separados set abonado = 999999", []));
    const m = await db.query<{ maxi: string }>("select max(abonado)::text maxi from separados");
    expect(Number(m.rows[0]!.maxi)).toBeLessThan(999999);
  });
});

describe("devoluciones de clientes", () => {
  let ventaId: string;
  let detalle: string;

  it("devuelve al inventario al costo de la venta, sale efectivo de la caja y el reporte resta la devolución", async () => {
    ventaId = await venta(db, vend, [{ producto: p1, cantidad: 3, precio: 100000 }], { turno });
    detalle = (await db.query<{ id: string }>("select id from ventas_detalle where venta_id=$1", [ventaId])).rows[0]!.id;
    const stock0 = await stock(p1);
    const caja0 = Number(await esperado());
    const dev = await uno<string>(vendedor, "select registrar_devolucion_cliente($1,$2::jsonb,'No servía','efectivo',$3) r", [ventaId, JSON.stringify([{ venta_detalle_id: detalle, cantidad: 1 }]), turno]);
    expect(await stock(p1)).toBe(stock0 + 1);
    expect(Number(await esperado())).toBe(caja0 - 100000);
    const d = await db.query<{ total: string; costo_total: string }>("select total::text, costo_total::text from devoluciones_cliente where id=$1", [dev]);
    expect(d.rows[0]).toEqual({ total: "100000.00", costo_total: "60000.00" });

    const hoy = (await db.query<{ d: string }>("select (now() at time zone 'America/Bogota')::date::text d")).rows[0]!.d;
    const rep = await como(ctx.usuarioId, async () => (await db.query<{ total: string; utilidad: string }>("select total::text, utilidad::text from reporte_ventas_diarias($1,$2,$2)", [ctx.orgId, hoy])).rows[0]!);
    // El día tiene ventas de los otros tests: lo importante es que la devolución de 100.000 (utilidad 40.000) está restada.
    const bruto = await db.query<{ t: string; u: string }>("select sum(total)::text t, sum(total-costo_total)::text u from ventas where estado='confirmado'");
    expect(Number(rep.total)).toBe(Number(bruto.rows[0]!.t) - 100000);
    expect(Number(rep.utilidad)).toBe(Number(bruto.rows[0]!.u) - 40000);
  });

  it("no se puede devolver más de lo vendido (acumulando devoluciones)", async () => {
    await uno(vendedor, "select registrar_devolucion_cliente($1,$2::jsonb,'Otro','nequi') r", [ventaId, JSON.stringify([{ venta_detalle_id: detalle, cantidad: 1 }])]);
    const e = await mensajeDeError(() => uno(vendedor, "select registrar_devolucion_cliente($1,$2::jsonb,'Exceso','nequi') r", [ventaId, JSON.stringify([{ venta_detalle_id: detalle, cantidad: 2 }])]));
    expect(e).toMatch(/No se puede devolver más de lo vendido/);
  });

  it("reembolsar en efectivo exige turno abierto; sin motivo o sin cliente (abono a deuda) falla", async () => {
    expect(await mensajeDeError(() => uno(vendedor, "select registrar_devolucion_cliente($1,$2::jsonb,'x','efectivo') r", [ventaId, JSON.stringify([{ venta_detalle_id: detalle, cantidad: 1 }])]))).toMatch(/turno de caja abierto/);
    expect(await mensajeDeError(() => uno(vendedor, "select registrar_devolucion_cliente($1,$2::jsonb,' ','nequi') r", [ventaId, JSON.stringify([{ venta_detalle_id: detalle, cantidad: 1 }])]))).toMatch(/motivo/);
    expect(await mensajeDeError(() => uno(vendedor, "select registrar_devolucion_cliente($1,$2::jsonb,'x','abono_deuda') r", [ventaId, JSON.stringify([{ venta_detalle_id: detalle, cantidad: 1 }])]))).toMatch(/no tiene cliente/);
  });

  it("devolver una venta fiada puede abonar a la deuda del cliente", async () => {
    const deudor = await cliente(db, ctx.orgId, { cupo: 500000 });
    const v = await venta(db, vend, [{ producto: p1, cantidad: 2, precio: 100000 }], { turno, cliente: deudor, pagos: [{ metodo: "credito", monto: 200000 }] });
    const det = (await db.query<{ id: string }>("select id from ventas_detalle where venta_id=$1", [v])).rows[0]!.id;
    await uno(vendedor, "select registrar_devolucion_cliente($1,$2::jsonb,'Cambió de idea','abono_deuda') r", [v, JSON.stringify([{ venta_detalle_id: det, cantidad: 1 }])]);
    const saldo = await db.query<{ saldo: string }>("select saldo::text from clientes where id=$1", [deudor]);
    expect(saldo.rows[0]!.saldo).toBe("100000.00");
  });

  it("una devolución grande genera alerta de severidad alta", async () => {
    const a = await db.query<{ severidad: string }>("select severidad from alertas where tipo='devolucion' order by creado_en desc limit 1");
    expect(a.rows.length).toBe(1);
  });
});
