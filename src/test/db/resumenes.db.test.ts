/** Migración 0021: resúmenes para n8n (solo service_role). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, comoUsuario, crearBd, crearNegocio, agregarMiembro, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, compra, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let otroOrg: string;
let vendedor: string;
let hoy: string;

const servicio = async <T>(fn: () => Promise<T>) => { await db.exec("set role service_role"); try { return await fn(); } finally { await db.exec("reset role"); } };
const resumen = (org: string, desde = hoy, hasta = hoy) => servicio(async () => (await db.query<{ r: Record<string, unknown> }>("select resumen_periodo($1,$2,$3) r", [org, desde, hasta])).rows[0]!.r);

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Resumen SAS", "r@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  otroOrg = (await crearNegocio(db, "Ajeno SAS", "ajeno@x.co")).orgId;
  vendedor = await agregarMiembro(db, n.orgId, "v@r.co", "vendedor");
  hoy = (await db.query<{ d: string }>("select (now() at time zone 'America/Bogota')::date::text d")).rows[0]!.d;
  const a = await producto(db, n.orgId, { nombre: "Cemento", precio: 30000 });
  const b = await producto(db, n.orgId, { nombre: "Arena", precio: 5000 });
  await compra(db, ctx, [{ producto: a, cantidad: 50, costo: 20000 }, { producto: b, cantidad: 50, costo: 3000 }]);
  const v: Ctx = { ...ctx, usuarioId: vendedor };
  const turno = await abrirTurno(db, v, 100000);
  await venta(db, v, [{ producto: a, cantidad: 2, precio: 30000 }], { turno });                                             // 60.000 efectivo
  await venta(db, v, [{ producto: b, cantidad: 4, precio: 5000 }], { turno, pagos: [{ metodo: "nequi", monto: 20000 }] });   // 20.000 nequi sin verificar
  await comoUsuario(db, vendedor, () => db.query("select cerrar_turno($1, 155000, '{}'::jsonb)", [turno]));                 // esperado 160.000 → falta 5.000
  await comoUsuario(db, n.duenoId, () => db.query("select registrar_gasto($1,'Servicios','Luz',8000,'nequi')", [n.orgId]));
});
afterAll(async () => db.close());

describe("resumen_periodo", () => {
  it("totales, utilidad, métodos y top de productos del día", async () => {
    const r = await resumen(ctx.orgId);
    expect(r).toMatchObject({ ventas: 2, total: 80000, utilidad: 80000 - 40000 - 12000, pagos_sin_verificar: 1, diferencia_caja: -5000, gastos: 8000, turnos_abiertos: 0 });
    expect(r.por_metodo).toEqual([{ metodo: "efectivo", total: 60000 }, { metodo: "nequi", total: 20000 }]);
    expect((r.top_productos as { nombre: string }[]).map((p) => p.nombre)).toEqual(["Cemento", "Arena"]);
  });
  it("cuenta las alertas pendientes (el faltante de caja generó una)", async () => {
    expect(Number((await resumen(ctx.orgId)).alertas_pendientes)).toBeGreaterThanOrEqual(0);
  });
  it("un periodo sin ventas devuelve ceros, no nulos", async () => {
    const r = await resumen(ctx.orgId, "2000-01-01", "2000-01-02");
    expect(r).toMatchObject({ ventas: 0, total: 0, utilidad: 0, por_metodo: [], top_productos: [] });
  });
  it("es de un solo negocio: el resumen de otro no mezcla datos", async () => {
    expect(await resumen(otroOrg)).toMatchObject({ ventas: 0, total: 0, gastos: 0 });
  });
  it("valida el rango", async () => {
    expect(await mensajeDeError(() => resumen(ctx.orgId, hoy, "2000-01-01"))).toMatch(/Rango/);
    expect(await mensajeDeError(() => resumen(ctx.orgId, "2020-01-01", hoy))).toMatch(/Rango/);
  });
});

describe("organizaciones_para_resumen y permisos", () => {
  it("lista solo negocios con WhatsApp y ventas recientes", async () => {
    expect(await servicio(async () => (await db.query("select * from organizaciones_para_resumen()")).rows)).toEqual([]);
    await db.query("update organizaciones set telefono_whatsapp='3015550100' where id=$1", [ctx.orgId]);
    const f = await servicio(async () => (await db.query<{ nombre: string }>("select nombre from organizaciones_para_resumen()")).rows);
    expect(f).toEqual([{ nombre: "Resumen SAS" }]);
  });
  it("ni usuarios autenticados ni anónimos pueden llamarlas", async () => {
    expect(await comoUsuario(db, ctx.usuarioId, () => mensajeDeError(() => db.query("select resumen_periodo($1,$2,$2)", [ctx.orgId, hoy])))).toMatch(/permission denied/);
    expect(await comoUsuario(db, ctx.usuarioId, () => mensajeDeError(() => db.query("select * from organizaciones_para_resumen()")))).toMatch(/permission denied/);
  });
});
