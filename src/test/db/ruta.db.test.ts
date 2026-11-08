/** Migración 0031: venta en ruta (plan, visitas offline e informe del dueño). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, cliente } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let ruta: string; // vendedor de ruta
let otraRuta: string;
let bodeguero: string;
let c1: string;
let c2: string;
let c3: string;
let dow: number;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const q = async <T extends object>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const planear = (u: string, usuario: string, dia: number, clientes: string[]) =>
  como(u, async () => (await q<{ n: number }>("select guardar_ruta($1,$2,$3,$4::uuid[]) n", [ctx.orgId, usuario, dia, clientes]))[0]!.n);
const visitar = (u: string, c: string, resultado: string, offline = crypto.randomUUID(), extra: { lat?: number | null; lng?: number | null; cuando?: string | null; nota?: string | null } = {}) =>
  como(u, async () =>
    (await q<{ id: string }>("select registrar_visita($1,$2,$3,$4,$5,$6,$7,$8,$9) id", [ctx.orgId, c, resultado, extra.nota ?? null, extra.lat ?? null, extra.lng ?? null, extra.lat != null ? 12 : null, offline, extra.cuando ?? null]))[0]!.id,
  );
const rutaDeHoy = (u: string) => como(u, () => q<{ cliente_id: string; nombre: string; orden: number; visitado: boolean; resultado: string | null; saldo: string }>("select cliente_id, nombre, orden, visitado, resultado, saldo::text from ruta_del_dia($1)", [ctx.orgId]));

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Distribuidora SAS", "r@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  ruta = await agregarMiembro(db, n.orgId, "ruta@r.co", "ruta");
  otraRuta = await agregarMiembro(db, n.orgId, "ruta2@r.co", "ruta");
  bodeguero = await agregarMiembro(db, n.orgId, "b@r.co", "bodeguero");
  c1 = await cliente(db, n.orgId, { nombre: "Tienda La Esquina" });
  c2 = await cliente(db, n.orgId, { nombre: "Miscelánea Don Pedro" });
  c3 = await cliente(db, n.orgId, { nombre: "Cliente de otro día" });
  await db.query("update clientes set direccion='Calle 15 # 8-20' where id=$1", [c1]);
  await como(n.duenoId, () => db.query("select registrar_deuda_inicial($1, 50000, 'Cuaderno')", [c1]));
  dow = (await q<{ dow: number }>("select extract(isodow from (now() at time zone 'America/Bogota')::date)::int dow"))[0]!.dow;
});
afterAll(async () => db.close());

describe("guardar_ruta", () => {
  it("solo dueño o admin; valida día, repetidos y clientes de otro negocio", async () => {
    expect(await mensajeDeError(() => planear(ruta, ruta, dow, [c1]))).toMatch(/Solo dueño o admin/);
    expect(await mensajeDeError(() => planear(ctx.usuarioId, ruta, 8, [c1]))).toMatch(/1 \(lunes\) a 7/);
    expect(await mensajeDeError(() => planear(ctx.usuarioId, ruta, dow, [c1, c1]))).toMatch(/repetidos/);
    const otro = await crearNegocio(db, "Otro", "o@x.co");
    const ajeno = await cliente(db, otro.orgId);
    expect(await mensajeDeError(() => planear(ctx.usuarioId, ruta, dow, [ajeno]))).toMatch(/no existe o está inactivo/);
    expect(await mensajeDeError(() => planear(ctx.usuarioId, crypto.randomUUID(), dow, [c1]))).toMatch(/no es parte del negocio/);
  });

  it("guarda el orden y reemplaza la lista anterior del mismo día", async () => {
    expect(await planear(ctx.usuarioId, ruta, dow, [c2, c1])).toBe(2);
    expect((await rutaDeHoy(ruta)).map((x) => x.nombre)).toEqual(["Miscelánea Don Pedro", "Tienda La Esquina"]);
    expect(await planear(ctx.usuarioId, ruta, dow, [c1])).toBe(1);
    expect((await rutaDeHoy(ruta)).map((x) => x.nombre)).toEqual(["Tienda La Esquina"]);
    await planear(ctx.usuarioId, ruta, dow, [c1, c2]);
    await planear(ctx.usuarioId, ruta, (dow % 7) + 1, [c3]); // otro día: no aparece hoy
  });
});

describe("ruta_del_dia", () => {
  it("cada vendedor ve solo su ruta, con deuda y dirección", async () => {
    const r = await rutaDeHoy(ruta);
    expect(r.map((x) => x.nombre)).toEqual(["Tienda La Esquina", "Miscelánea Don Pedro"]);
    expect(r[0]).toMatchObject({ visitado: false, resultado: null, saldo: "50000.00" });
    expect(await rutaDeHoy(otraRuta)).toEqual([]);
    expect((await como(ruta, () => q<{ direccion: string }>("select direccion from ruta_del_dia($1) limit 1", [ctx.orgId])))[0]!.direccion).toBe("Calle 15 # 8-20");
  });
  it("un bodeguero no tiene ruta", async () => {
    expect(await mensajeDeError(() => rutaDeHoy(bodeguero))).toMatch(/Sin permiso/);
  });
});

describe("registrar_visita (idempotente y válida)", () => {
  it("registra con ubicación y la marca como visitada en la ruta", async () => {
    await visitar(ruta, c1, "pedido", crypto.randomUUID(), { lat: 11.5444, lng: -72.9072, nota: "Pidió 10 bultos" });
    const r = await rutaDeHoy(ruta);
    expect(r[0]).toMatchObject({ visitado: true, resultado: "pedido" });
    expect(r[1]).toMatchObject({ visitado: false });
  });

  it("el mismo offline_id no duplica la visita (sincronización repetida)", async () => {
    const id = crypto.randomUUID();
    const a = await visitar(ruta, c2, "sin_pedido", id);
    const b = await visitar(ruta, c2, "sin_pedido", id);
    expect(b).toBe(a);
    expect((await q<{ n: string }>("select count(*)::text n from visitas where offline_id=$1", [id]))[0]!.n).toBe("1");
  });

  it("valida resultado, ubicación incompleta, fechas imposibles y clientes ajenos", async () => {
    const uno = () => crypto.randomUUID();
    expect(await mensajeDeError(() => visitar(ruta, c1, "inventado", uno()))).toMatch(/check|violates/i);
    expect(await mensajeDeError(() => visitar(ruta, c1, "pedido", uno(), { lat: 11.5 }))).toMatch(/check|violates/i);
    expect(await mensajeDeError(() => visitar(ruta, c1, "pedido", uno(), { lat: 95, lng: 0 }))).toMatch(/check|violates/i);
    expect(await mensajeDeError(() => visitar(ruta, c1, "pedido", uno(), { cuando: new Date(Date.now() + 3_600_000).toISOString() }))).toMatch(/fecha de la visita/);
    expect(await mensajeDeError(() => visitar(ruta, c1, "pedido", uno(), { cuando: new Date(Date.now() - 9 * 86_400_000).toISOString() }))).toMatch(/fecha de la visita/);
    const otro = await crearNegocio(db, "Otro2", "o2@x.co");
    const ajeno = await cliente(db, otro.orgId);
    expect(await mensajeDeError(() => visitar(ruta, ajeno, "pedido", uno()))).toMatch(/Cliente no existe/);
    expect(await mensajeDeError(() => visitar(bodeguero, c1, "pedido", uno()))).toMatch(/Sin permiso/);
  });

  it("acepta una visita hecha hace 2 días sin internet", async () => {
    const cuando = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await expect(visitar(ruta, c1, "cobro", crypto.randomUUID(), { cuando })).resolves.toBeTruthy();
  });
});

describe("informes del dueño", () => {
  it("resumen_rutas cuenta planificadas, visitadas y resultados por vendedor", async () => {
    await visitar(otraRuta, c3, "cerrado");
    const filas = await como(ctx.usuarioId, () => q<{ nombre: string; planificadas: number; visitadas: number; pedidos: number; sin_pedido: number; cerrados: number }>("select nombre, planificadas, visitadas, pedidos, sin_pedido, cerrados from resumen_rutas($1) order by nombre", [ctx.orgId]));
    const a = filas.find((f) => f.nombre === "ruta@r.co")!;
    expect(a).toMatchObject({ planificadas: 2, visitadas: 2, pedidos: 1, sin_pedido: 1 });
    expect(filas.find((f) => f.nombre === "ruta2@r.co")).toMatchObject({ visitadas: 1, cerrados: 1 });
  });

  it("visitas_del_dia trae la ubicación; un vendedor de ruta no ve los informes ni las visitas ajenas", async () => {
    const v = await como(ctx.usuarioId, () => q<{ cliente: string; lat: string | null }>("select cliente, lat::text from visitas_del_dia($1) where resultado='pedido'", [ctx.orgId]));
    expect(v[0]).toMatchObject({ cliente: "Tienda La Esquina", lat: "11.544400" });
    expect(await mensajeDeError(() => como(ruta, () => db.query("select * from resumen_rutas($1)", [ctx.orgId])))).toMatch(/Sin permiso/);
    expect(await como(ruta, async () => (await q("select id from visitas where usuario_id <> auth.uid()")).length)).toBe(0);
    expect(await como(otraRuta, async () => (await q("select id from ruta_clientes")).length)).toBe(0);
  });
});
