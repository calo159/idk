/** Migración 0037: comparación anónima con negocios del mismo nicho. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, compra, producto, venta } from "./fabrica";

let db: Bd;
let yo: { orgId: string; duenoId: string; bodegaId: string };
let vendedor: string;
let n = 0;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const q = async <T extends object>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const comparar = (u = yo.duenoId, org = yo.orgId) => como(u, async () => (await q<{ r: Record<string, any> }>("select benchmark_nicho($1) r", [org]))[0]!.r); // eslint-disable-line @typescript-eslint/no-explicit-any
const compartir = (u: string, org: string, si = true) => como(u, () => db.query("select configurar_benchmark($1,$2)", [org, si]));

/** Un negocio del grupo con una foto de salud (margen = utilidad/ventas·100, etc.). */
async function vecino(nicho: string, m: { margen: number; ventas?: number; vencido?: number; dias?: number; compartir?: boolean; hace?: number }) {
  const nego = await crearNegocio(db, `Vecino ${++n}`, `vecino${n}@x.co`, nicho);
  if (m.compartir !== false) await db.query("update organizaciones set compartir_benchmark = true where id=$1", [nego.orgId]);
  const ventas = m.ventas ?? 1_000_000;
  const costoVentas = ventas * (1 - m.margen / 100);
  await db.query("insert into salud_historial (organizacion_id, fecha, metricas) values ($1, (now() at time zone 'America/Bogota')::date - $2::int, $3::jsonb)", [
    nego.orgId, m.hace ?? 0,
    JSON.stringify({ desde: "x", hasta: "y", ventas_n: 40, ventas_netas: ventas, utilidad: ventas - costoVentas, costo_ventas: costoVentas, inventario_valor: (costoVentas / 30) * (m.dias ?? 40), vencido: m.vencido ?? 0, por_cobrar: 0, merma: 0, faltantes_caja: 0 }),
  ]);
  return nego;
}

beforeAll(async () => {
  db = await crearBd();
  yo = await crearNegocio(db, "Mi Ferretería", "yo@x.co", "ferreteria");
  vendedor = await agregarMiembro(db, yo.orgId, "v@yo.co", "vendedor");
  // Yo: 10 ventas con 30 % de margen (para tener datos propios).
  const ctx: Ctx = { orgId: yo.orgId, usuarioId: yo.duenoId, bodegaId: yo.bodegaId };
  const p = await producto(db, yo.orgId, { nombre: "Cemento", precio: 100000 });
  await compra(db, ctx, [{ producto: p, cantidad: 100, costo: 70000 }]);
  const turno = await abrirTurno(db, ctx, 0);
  for (let i = 0; i < 10; i++) await venta(db, ctx, [{ producto: p, cantidad: 1, precio: 100000 }], { turno });
});
afterAll(async () => db.close());

describe("opt-in", () => {
  it("sin compartir no ves nada (y nadie ve tus cifras)", async () => {
    expect(await comparar()).toEqual({ compartiendo: false, nicho: "ferreteria" });
  });
  it("solo el dueño decide compartir", async () => {
    expect(await mensajeDeError(() => compartir(vendedor, yo.orgId))).toMatch(/Solo el dueño/);
    const admin = await agregarMiembro(db, yo.orgId, "a@yo.co", "admin");
    expect(await mensajeDeError(() => compartir(admin, yo.orgId))).toMatch(/Solo el dueño/);
  });
  it("compartiendo pero con pocos vecinos: no muestra nada", async () => {
    await compartir(yo.duenoId, yo.orgId);
    for (let i = 0; i < 5; i++) await vecino("ferreteria", { margen: 20 });
    expect(await comparar()).toEqual({ compartiendo: true, nicho: "ferreteria", cohorte_insuficiente: true });
  });
});

describe("grupo de comparación", () => {
  beforeAll(async () => {
    // Vecinos 6..8 (ya hay 5): márgenes 20,20,20,20,20 + 10, 25, 40 → el mío es 30 %.
    await vecino("ferreteria", { margen: 10 });
    await vecino("ferreteria", { margen: 25 });
    await vecino("ferreteria", { margen: 40 });
  });

  it("con 6 o más vecinos, entrega percentiles y en qué posición quedas", async () => {
    const r = await comparar();
    expect(r).toMatchObject({ compartiendo: true, negocios: 8 });
    expect(r.razones.margen).toMatchObject({ tuyo: 30, p25: 20, mediana: 20, p75: 21.25, por_debajo: 0.88, por_encima: 0.13 }); // 7 de 8 tienen menos margen que yo y 1 (el de 40 %) tiene más
  });

  it("solo cuentan los del mismo nicho, los que comparten y las fotos recientes", async () => {
    const antes = (await comparar()).negocios;
    await vecino("ropa", { margen: 5 });                       // otro nicho
    await vecino("ferreteria", { margen: 5, compartir: false }); // no comparte
    await vecino("ferreteria", { margen: 5, hace: 20 });        // foto vieja (> 14 días)
    expect((await comparar()).negocios).toBe(antes);
    await vecino("ferreteria", { margen: 5, hace: 10 });        // reciente: sí cuenta
    expect((await comparar()).negocios).toBe(antes! + 1);
  });

  it("no incluye a los negocios con muy pocas ventas (ruido)", async () => {
    const antes = (await comparar()).negocios;
    const poco = await vecino("ferreteria", { margen: 99 });
    await db.query("update salud_historial set metricas = jsonb_set(metricas, '{ventas_n}', '3') where organizacion_id=$1", [poco.orgId]);
    expect((await comparar()).negocios).toBe(antes);
  });

  it("la respuesta no trae ids ni nombres de otros negocios", async () => {
    const texto = JSON.stringify(await comparar());
    expect(texto).not.toMatch(/Vecino/);
    expect(texto).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(Object.keys((await comparar()).razones.margen).sort()).toEqual(["mediana", "p25", "p75", "por_debajo", "por_encima", "tuyo"]);
  });

  it("la deuda vencida y la rotación también se comparan", async () => {
    const r = await comparar();
    expect(r.razones.vencido).toMatchObject({ tuyo: 0 });
    expect(r.razones.rotacion).toBeDefined();
    expect(r.razones.ticket).toMatchObject({ tuyo: 100000 });
  });

  it("al dejar de compartir sales del grupo y dejas de ver la comparación", async () => {
    const otro = await vecino("ferreteria", { margen: 15 });
    const conOtro = (await comparar()).negocios;
    await compartir(otro.duenoId, otro.orgId, false);
    expect((await comparar()).negocios).toBe(conOtro - 1);
    await compartir(yo.duenoId, yo.orgId, false);
    expect(await comparar()).toEqual({ compartiendo: false, nicho: "ferreteria" });
    await compartir(yo.duenoId, yo.orgId, true);
  });

  it("otro negocio no puede consultar por el mío", async () => {
    const ajeno = await crearNegocio(db, "Ajeno", "ajeno@x.co", "ferreteria");
    expect(await mensajeDeError(() => comparar(ajeno.duenoId, yo.orgId))).toMatch(/Sin permiso/);
  });
});
