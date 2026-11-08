/** Migración 0026: calendario de temporadas y su efecto en la compra sugerida. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, compra, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let catA: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const factor = async (desde: string, dias: number, cat: string | null = null) =>
  Number((await db.query<{ f: string }>("select factor_temporada($1,$2,$3::date,$4)::text f", [ctx.orgId, cat, desde, dias])).rows[0]!.f);
const guardar = (nombre: string, mi: number, di: number, mf: number, df: number, f: number, cat: string | null = null) =>
  como(ctx.usuarioId, async () => (await db.query<{ id: string }>("select guardar_temporada($1,$2,$3,$4,$5,$6,$7,$8) id", [ctx.orgId, nombre, mi, di, mf, df, f, cat])).rows[0]!.id);

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Temporadas SAS", "t@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@t.co", "vendedor");
  catA = (await db.query<{ id: string }>("select id from categorias where organizacion_id=$1 limit 1", [n.orgId])).rows[0]!.id;
});
afterAll(async () => db.close());

describe("factor_temporada", () => {
  it("sin temporadas el factor es 1", async () => {
    expect(await factor("2026-12-01", 30)).toBe(1);
  });
  it("promedia el factor sobre los días del horizonte: 10 días dentro y 10 fuera", async () => {
    await guardar("Navidad", 12, 1, 1, 6, 1.5);
    // horizonte 20 días desde el 22 nov: del 1 al 10 dic hay 10 días... 22 nov–11 dic = 20 días, 11 dentro (1–11 dic)
    expect(await factor("2026-11-22", 20)).toBeCloseTo((11 * 1.5 + 9 * 1) / 20, 3);
    expect(await factor("2026-12-10", 5)).toBe(1.5); // todo adentro
    expect(await factor("2026-03-01", 30)).toBe(1); // todo afuera
  });
  it("cruza el cambio de año (1 dic – 6 ene) y se repite cada año", async () => {
    expect(await factor("2027-01-03", 4)).toBeCloseTo((4 * 1.5 + 0) / 4, 3); // 3,4,5,6 ene = adentro
    expect(await factor("2027-01-05", 4)).toBeCloseTo((2 * 1.5 + 2 * 1) / 4, 3); // 5,6 adentro; 7,8 afuera
    expect(await factor("2031-12-20", 1)).toBe(1.5);
  });
  it("si se solapan temporadas, ese día vale la de mayor factor (no se multiplican)", async () => {
    await guardar("Evento especial", 12, 3, 12, 5, 2.0);
    expect(await factor("2026-12-03", 3)).toBe(2);
    expect(await factor("2026-12-06", 1)).toBe(1.5);
  });
  it("una temporada de categoría solo afecta a esa categoría; una desactivada no cuenta", async () => {
    const id = await guardar("Pinturas de verano", 7, 1, 7, 31, 1.8, catA);
    expect(await factor("2026-07-10", 5, catA)).toBe(1.8);
    expect(await factor("2026-07-10", 5, null)).toBe(1);
    await como(ctx.usuarioId, () => db.query("select activar_temporada($1,false)", [id]));
    expect(await factor("2026-07-10", 5, catA)).toBe(1);
  });
});

describe("guardar_temporada y permisos", () => {
  it("valida factor, fechas y nombre; editar no duplica", async () => {
    const f = (sql: string, args: unknown[]) => como(ctx.usuarioId, () => mensajeDeError(() => db.query(sql, args)));
    expect(await f("select guardar_temporada($1,'X',1,1,1,2,0.01)", [ctx.orgId])).toMatch(/entre 0,1 y 10/);
    expect(await f("select guardar_temporada($1,'X',2,30,3,1,1.2)", [ctx.orgId])).toMatch(/Fecha inválida|out of range|field value/i);
    expect(await f("select guardar_temporada($1,' ',1,1,1,2,1.2)", [ctx.orgId])).toMatch(/nombre/);
    const id = await guardar("Editable", 3, 1, 3, 10, 1.1);
    await como(ctx.usuarioId, () => db.query("select guardar_temporada($1,'Editada',3,1,3,12,1.3,null,$2)", [ctx.orgId, id]));
    const r = await db.query<{ nombre: string; factor: string }>("select nombre, factor::text from temporadas where id=$1", [id]);
    expect(r.rows).toEqual([{ nombre: "Editada", factor: "1.30" }]);
  });
  it("cargar_temporadas_base crea las de Colombia una sola vez", async () => {
    const n1 = await como(ctx.usuarioId, async () => (await db.query<{ n: number }>("select cargar_temporadas_base($1) n", [ctx.orgId])).rows[0]!.n);
    expect(n1).toBeGreaterThanOrEqual(5);
    const n2 = await como(ctx.usuarioId, async () => (await db.query<{ n: number }>("select cargar_temporadas_base($1) n", [ctx.orgId])).rows[0]!.n);
    expect(n2).toBe(0);
  });
  it("el vendedor no edita temporadas; otro negocio no las ve", async () => {
    expect(await como(vendedor, () => mensajeDeError(() => db.query("select guardar_temporada($1,'X',1,1,1,2,1.2)", [ctx.orgId])))).toMatch(/Solo dueño o admin/);
    const otro = await crearNegocio(db, "Otro", "otro@x.co");
    expect(await como(otro.duenoId, async () => (await db.query("select * from temporadas")).rows)).toEqual([]);
  });
});

describe("efecto en la compra sugerida", () => {
  it("en vísperas de una temporada fuerte sugiere comprar más", async () => {
    const p = await producto(db, ctx.orgId, { nombre: "Adorno navideño" });
    await compra(db, ctx, [{ producto: p, cantidad: 100, costo: 1000 }]);
    const v = { ...ctx, usuarioId: vendedor };
    const turno = await abrirTurno(db, v);
    await venta(db, v, [{ producto: p, cantidad: 70, precio: 3000 }], { turno }); // stock 30, ritmo alto
    const sugerida = () =>
      como(ctx.usuarioId, async () => {
        const r = await db.query<{ sugerida: string; factor: string }>("select sugerida::text, factor::text from sugerencia_compras($1,14,3) where producto='Adorno navideño'", [ctx.orgId]);
        return r.rows[0];
      });
    const hoy = (await db.query<{ d: string }>("select (now() at time zone 'America/Bogota')::date::text d")).rows[0]!.d;
    // Una temporada que cubre TODO el horizonte de 17 días con factor 2
    const mes = Number(hoy.slice(5, 7)); const dia = Number(hoy.slice(8, 10));
    await db.query("delete from temporadas");
    const sin = await sugerida();
    await guardar("Temporada ya", mes, dia, mes === 12 ? 12 : mes + 1, dia > 28 ? 28 : dia, 2);
    const con = await sugerida();
    expect(Number(con!.factor)).toBeGreaterThan(1);
    expect(Number(con!.sugerida)).toBeGreaterThan(Number(sin!.sugerida));
  });
});
