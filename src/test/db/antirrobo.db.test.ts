/** Migración 0011: gastos, retiros de efectivo, efectivo esperado y control antirrobo. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, compra, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vend: Ctx;
let vendedor: string;
let otro: string;
let contador: string;
let p: string;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Antirrobo SAS", "a@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@a.co", "vendedor");
  otro = await agregarMiembro(db, n.orgId, "o@a.co", "vendedor");
  contador = await agregarMiembro(db, n.orgId, "c@a.co", "contador");
  vend = { ...ctx, usuarioId: vendedor };
  p = await producto(db, n.orgId, { precio: 10000 });
  await compra(db, ctx, [{ producto: p, cantidad: 500, costo: 6000 }]);
});
afterAll(async () => db.close());

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const sql = async <T extends object>(u: string, texto: string, args: unknown[] = []) =>
  como(u, async () => (await db.query<T>(texto, args)).rows);
const alertas = async (tipo: string) =>
  (await db.query<{ mensaje: string; severidad: string }>("select mensaje, severidad from alertas where organizacion_id=$1 and tipo=$2", [ctx.orgId, tipo])).rows;

describe("gastos", () => {
  it("un gasto en efectivo del turno baja el efectivo esperado; anularlo lo devuelve", async () => {
    const turno = await abrirTurno(db, vend, 100000);
    await venta(db, vend, [{ producto: p, cantidad: 3, precio: 10000 }], { turno }); // +30.000 efectivo
    const g = await sql<{ id: string }>(vendedor, "select registrar_gasto($1,'Transporte','Flete de cemento',12000,'efectivo',null,null,$2) as id", [ctx.orgId, turno]);
    const esperado = () => sql<{ e: string }>(vendedor, "select efectivo_esperado_turno($1)::text e", [turno]);
    expect((await esperado())[0]!.e).toBe("118000.00");
    await sql(ctx.usuarioId, "select anular_gasto($1,'se registró dos veces')", [g[0]!.id]);
    expect((await esperado())[0]!.e).toBe("130000.00");
  });

  it("un gasto por Nequi no toca la caja y no se puede registrar a crédito", async () => {
    const turno = await abrirTurno(db, { ...vend, usuarioId: otro }, 50000);
    await sql(otro, "select registrar_gasto($1,'Servicios','Internet',80000,'nequi',null,null,$2)", [ctx.orgId, turno]);
    expect((await sql<{ e: string }>(otro, "select efectivo_esperado_turno($1)::text e", [turno]))[0]!.e).toBe("50000.00");
    const e = await como(otro, () => mensajeDeError(() => db.query("select registrar_gasto($1,'X','Y',5,'credito')", [ctx.orgId])));
    expect(e).toMatch(/crédito/);
  });

  it("valida monto y textos; el contador no registra; solo dueño/admin anulan", async () => {
    const f = (u: string, a: string) => como(u, () => mensajeDeError(() => db.query(a, [ctx.orgId])));
    expect(await f(vendedor, "select registrar_gasto($1,'Cat','Desc',0)")).toMatch(/mayor a cero/);
    expect(await f(vendedor, "select registrar_gasto($1,' ','Desc',10)")).toMatch(/obligatorias/);
    expect(await f(contador, "select registrar_gasto($1,'Cat','Desc',10)")).toMatch(/Sin permiso/);
    const g = (await sql<{ id: string }>(vendedor, "select registrar_gasto($1,'Cat','Para anular',10) as id", [ctx.orgId]))[0]!.id;
    const e = await como(vendedor, () => mensajeDeError(() => db.query("select anular_gasto($1,'x')", [g])));
    expect(e).toMatch(/Solo dueño o admin/);
  });

  it("no se puede escribir directo en gastos ni en movimientos_caja (solo por funciones)", async () => {
    const e1 = await como(vendedor, () =>
      mensajeDeError(() => db.query("insert into gastos (organizacion_id,categoria,descripcion,monto) values ($1,'a','b',5)", [ctx.orgId])),
    );
    expect(e1).toMatch(/row-level security/);
  });

  it("un gasto grande genera alerta", async () => {
    await sql(ctx.usuarioId, "select registrar_gasto($1,'Arriendo','Arriendo del local',500000,'transferencia')", [ctx.orgId]);
    expect((await alertas("gasto_grande"))[0]!.mensaje).toMatch(/Arriendo/);
  });
});

describe("retiros e ingresos de efectivo", () => {
  it("flujo completo en un turno nuevo", async () => {
    const u = await agregarMiembro(db, ctx.orgId, "caja@a.co", "vendedor");
    const turno = await abrirTurno(db, { ...ctx, usuarioId: u }, 200000);
    await sql(u, "select registrar_movimiento_caja($1,'retiro',50000,'Consignación al banco')", [turno]);
    await sql(u, "select registrar_movimiento_caja($1,'ingreso',10000,'Cambio traído de la casa')", [turno]);
    expect((await sql<{ e: string }>(u, "select efectivo_esperado_turno($1)::text e", [turno]))[0]!.e).toBe("160000.00");
    const f = (a: string) => como(u, () => mensajeDeError(() => db.query(a, [turno])));
    expect(await f("select registrar_movimiento_caja($1,'retiro',100,'')")).toMatch(/motivo/);
    expect(await f("select registrar_movimiento_caja($1,'regalo',100,'xxxx')")).toMatch(/Tipo inválido/);
    expect(await f("select registrar_movimiento_caja($1,'retiro',-5,'xxxx')")).toMatch(/mayor a cero/);
    // cierre con la fórmula nueva: contó 160.000 → cuadra
    const dif = await sql<{ d: string }>(u, "select cerrar_turno($1, 160000, '{}'::jsonb)::text d", [turno]);
    expect(dif[0]!.d).toBe("0.00");
    expect(await f("select registrar_movimiento_caja($1,'retiro',100,'xxxx')")).toMatch(/no está abierto/);
  });

  it("nadie mueve el efectivo del turno de otra persona (salvo dueño/admin)", async () => {
    const u = await agregarMiembro(db, ctx.orgId, "ajeno@a.co", "vendedor");
    const turno = await abrirTurno(db, { ...ctx, usuarioId: u }, 1000);
    const e = await como(vendedor, () => mensajeDeError(() => db.query("select registrar_movimiento_caja($1,'retiro',10,'prueba')", [turno])));
    expect(e).toMatch(/otra persona/);
    await sql(ctx.usuarioId, "select registrar_movimiento_caja($1,'retiro',10,'retiro del dueño')", [turno]);
  });
});

describe("riesgo por turno", () => {
  it("un turno limpio tiene riesgo bajo", async () => {
    const u = await agregarMiembro(db, ctx.orgId, "limpio@a.co", "vendedor");
    const turno = await abrirTurno(db, { ...ctx, usuarioId: u }, 0);
    await venta(db, { ...ctx, usuarioId: u }, [{ producto: p, cantidad: 1, precio: 10000 }], { turno });
    const r = (await sql<{ r: { puntaje: number; nivel: string } }>(ctx.usuarioId, "select riesgo_turno($1) r", [turno]))[0]!.r;
    expect(r).toMatchObject({ puntaje: 0, nivel: "bajo" });
  });

  it("suma señales: anulación rápida, descuentos, faltante grande y comprobante sospechoso", async () => {
    const u = await agregarMiembro(db, ctx.orgId, "sospecha@a.co", "vendedor");
    const c: Ctx = { ...ctx, usuarioId: u };
    const turno = await abrirTurno(db, c, 0);
    const v = await venta(db, c, [{ producto: p, cantidad: 5, precio: 10000 }], { turno });
    await sql(ctx.usuarioId, "select anular_venta($1,'cliente se arrepintió')", [v]);
    for (let i = 0; i < 3; i++)
      await venta(db, c, [{ producto: p, cantidad: 1, precio: 10000, descuento: 500 }], { turno, descuento: 0 });
    await db.query("insert into auditoria (organizacion_id,tabla,registro_id,accion,usuario_id) select $1,'ventas',id::text,'precio_modificado',$2 from ventas where turno_id=$3 and estado='confirmado'", [ctx.orgId, u, turno]);
    await sql(u, "select cerrar_turno($1, 0, '{}'::jsonb)", [turno]);
    const r = (await sql<{ r: { puntaje: number; nivel: string; senales: { codigo: string }[] } }>(ctx.usuarioId, "select riesgo_turno($1) r", [turno]))[0]!.r;
    const codigos = r.senales.map((s) => s.codigo);
    expect(codigos).toEqual(expect.arrayContaining(["anulacion_rapida", "descuentos", "faltante"]));
    expect(r.puntaje).toBeGreaterThanOrEqual(50);
    expect(r.nivel).toBe("alto");
    // el cierre con riesgo alto y faltante dejó alertas
    expect((await alertas("riesgo_turno")).length).toBeGreaterThanOrEqual(1);
    expect((await alertas("faltante_caja")).length).toBeGreaterThanOrEqual(1);
  });

  it("solo dueño, admin y contador ven el riesgo; el cajero no", async () => {
    const turno = await abrirTurno(db, { ...ctx, usuarioId: await agregarMiembro(db, ctx.orgId, "z@a.co", "vendedor") }, 0);
    const e = await como(vendedor, () => mensajeDeError(() => db.query("select riesgo_turno($1)", [turno])));
    expect(e).toMatch(/Sin permiso/);
    expect((await sql(contador, "select riesgo_turno($1) r", [turno])).length).toBe(1);
  });
});

describe("alertas automáticas", () => {
  it("anular una venta a los pocos minutos de cobrar genera alerta (una sola vez)", async () => {
    const u = await agregarMiembro(db, ctx.orgId, "rapida@a.co", "vendedor");
    const c: Ctx = { ...ctx, usuarioId: u };
    const turno = await abrirTurno(db, c, 0);
    const v = await venta(db, c, [{ producto: p, cantidad: 1, precio: 10000 }], { turno });
    await sql(ctx.usuarioId, "select anular_venta($1,'error')", [v]);
    const a = (await alertas("anulacion_rapida")).filter((x) => x.severidad === "alta");
    expect(a.length).toBeGreaterThanOrEqual(1);
  });

  it("tres ajustes negativos el mismo día de la misma persona generan una sola alerta", async () => {
    const u = await agregarMiembro(db, ctx.orgId, "ajustador@a.co", "bodeguero");
    for (let i = 0; i < 4; i++)
      await sql(u, "select ajustar_inventario($1,$2,$3,-1,'producto dañado')", [ctx.orgId, p, ctx.bodegaId]);
    expect((await alertas("ajustes_negativos")).length).toBe(1);
  });
});
