/** Migración 0010: reportes de ventas por día, producto, vendedor y método de pago. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, compra, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let contador: string;
let p1: string;
let p2: string;
let v1: string;
let v2: string;
let vAnulada: string;

/** Mueve una venta a un instante exacto (para probar los límites del día de Bogotá). */
const fechar = (id: string, iso: string) =>
  db.transaction(async (tx) => {
    // Los documentos confirmados son inmutables; el bypass interno solo existe en las funciones de negocio.
    await tx.query("select set_config('surtix.desde_funcion', 'si', true)");
    await tx.query("update ventas set creado_en = $2::timestamptz where id = $1", [id, iso]);
  });

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Reportes SAS", "r@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@r.co", "vendedor");
  contador = await agregarMiembro(db, n.orgId, "c@r.co", "contador");
  p1 = await producto(db, n.orgId, { nombre: "Cemento", precio: 30000 });
  p2 = await producto(db, n.orgId, { nombre: "Alambre", precio: 5000 });
  await compra(db, ctx, [
    { producto: p1, cantidad: 100, costo: 20000 },
    { producto: p2, cantidad: 100, costo: 3000 },
  ]);
  const vend: Ctx = { ...ctx, usuarioId: vendedor };
  const turno = await abrirTurno(db, vend);
  // v1: 2 cementos (efectivo) · v2: 1 cemento + 3 alambres (nequi) · vAnulada: 1 alambre
  v1 = await venta(db, vend, [{ producto: p1, cantidad: 2, precio: 30000 }], { turno });
  v2 = await venta(
    db,
    vend,
    [{ producto: p1, cantidad: 1, precio: 30000 }, { producto: p2, cantidad: 3, precio: 5000 }],
    { turno, pagos: [{ metodo: "nequi", monto: 45000 }] },
  );
  vAnulada = await venta(db, vend, [{ producto: p2, cantidad: 1, precio: 5000 }], { turno });
  await comoUsuario(db, ctx.usuarioId, () => db.query("select anular_venta($1, 'error de digitación')", [vAnulada]));
  // Fechas: v1 el 10-nov a las 23:30 hora Bogotá (= 11-nov 04:30 UTC), v2 el 11-nov mediodía, la anulada el 10-nov
  await fechar(v1, "2026-11-10T23:30:00-05:00");
  await fechar(v2, "2026-11-11T12:00:00-05:00");
  await fechar(vAnulada, "2026-11-10T10:00:00-05:00");
});
afterAll(async () => db.close());

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const q = <T extends object>(u: string, sql: string, args: unknown[]) =>
  como(u, async () => (await db.query<T>(sql, args)).rows);

describe("reporte_ventas_diarias", () => {
  it("agrupa por día de Bogotá: la venta de las 11:30 p. m. cuenta el día 10", async () => {
    const filas = await q<{ dia: string; ventas: string; total: string; costo: string; utilidad: string }>(
      ctx.usuarioId,
      "select dia::text, ventas::text, total::text, costo::text, utilidad::text from reporte_ventas_diarias($1,'2026-11-09','2026-11-12')",
      [ctx.orgId],
    );
    const porDia = Object.fromEntries(filas.map((f) => [f.dia, f]));
    expect(porDia["2026-11-09"]).toMatchObject({ ventas: "0", total: "0" });
    // 10-nov: solo v1 (la anulada no cuenta): 2 × 30.000 = 60.000; costo 2 × 20.000 = 40.000
    expect(porDia["2026-11-10"]).toMatchObject({ ventas: "1", total: "60000.00", costo: "40000.00", utilidad: "20000.00" });
    // 11-nov: v2 = 30.000 + 15.000; costo 20.000 + 3 × 3.000 = 29.000
    expect(porDia["2026-11-11"]).toMatchObject({ ventas: "1", total: "45000.00", costo: "29000.00", utilidad: "16000.00" });
    expect(porDia["2026-11-12"]).toMatchObject({ ventas: "0" });
  });
});

describe("reporte_ventas_por_producto", () => {
  it("suma cantidad, ingreso y utilidad por producto sin contar anuladas", async () => {
    const filas = await q<{ nombre: string; cantidad: string; ingreso: string; costo: string; utilidad: string }>(
      ctx.usuarioId,
      "select nombre, cantidad::text, ingreso::text, costo::text, utilidad::text from reporte_ventas_por_producto($1,'2026-11-01','2026-11-30')",
      [ctx.orgId],
    );
    expect(filas).toEqual([
      { nombre: "Cemento", cantidad: "3.000", ingreso: "90000.00", costo: "60000.00", utilidad: "30000.00" },
      { nombre: "Alambre", cantidad: "3.000", ingreso: "15000.00", costo: "9000.00", utilidad: "6000.00" },
    ]);
  });
  it("respeta el límite", async () => {
    const filas = await q<{ nombre: string }>(ctx.usuarioId, "select nombre from reporte_ventas_por_producto($1,'2026-11-01','2026-11-30',1)", [ctx.orgId]);
    expect(filas).toHaveLength(1);
  });
});

describe("por vendedor y por método", () => {
  it("por vendedor", async () => {
    const filas = await q<{ nombre: string; ventas: string; total: string }>(
      ctx.usuarioId,
      "select nombre, ventas::text, total::text from reporte_ventas_por_vendedor($1,'2026-11-01','2026-11-30')",
      [ctx.orgId],
    );
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ ventas: "2", total: "105000.00" });
  });
  it("por método de pago: efectivo y nequi, sin la venta anulada", async () => {
    const filas = await q<{ metodo: string; total: string }>(
      ctx.usuarioId,
      "select metodo, total::text from reporte_ventas_por_metodo($1,'2026-11-01','2026-11-30')",
      [ctx.orgId],
    );
    expect(filas).toEqual([
      { metodo: "efectivo", total: "60000.00" },
      { metodo: "nequi", total: "45000.00" },
    ]);
  });
});

describe("permisos y validaciones", () => {
  it("el contador puede ver reportes; el vendedor no", async () => {
    expect(await q(contador, "select * from reporte_ventas_diarias($1,'2026-11-10','2026-11-10')", [ctx.orgId])).toHaveLength(1);
    const e = await como(vendedor, () =>
      mensajeDeError(() => db.query("select * from reporte_ventas_diarias($1,'2026-11-10','2026-11-10')", [ctx.orgId])),
    );
    expect(e).toMatch(/Sin permiso/);
  });
  it("otro negocio no puede ver los reportes de este", async () => {
    const otro = await crearNegocio(db, "Curioso SAS", "curioso@x.co");
    const e = await como(otro.duenoId, () =>
      mensajeDeError(() => db.query("select * from reporte_ventas_por_producto($1,'2026-11-01','2026-11-30')", [ctx.orgId])),
    );
    expect(e).toMatch(/Sin permiso/);
  });
  it("rechaza rangos invertidos o mayores a un año", async () => {
    const invertido = await como(ctx.usuarioId, () =>
      mensajeDeError(() => db.query("select * from reporte_ventas_diarias($1,'2026-11-10','2026-11-01')", [ctx.orgId])),
    );
    expect(invertido).toMatch(/inválido/);
    const largo = await como(ctx.usuarioId, () =>
      mensajeDeError(() => db.query("select * from reporte_ventas_diarias($1,'2024-01-01','2026-01-01')", [ctx.orgId])),
    );
    expect(largo).toMatch(/un año/);
  });
  it("el anónimo no puede ejecutar los reportes", async () => {
    const e = await mensajeDeError(() => db.query("select * from reporte_ventas_diarias($1,'2026-11-10','2026-11-10')", [ctx.orgId]));
    expect(e).not.toBeNull();
  });
});
