/** Migración 0032: medidas del puntaje de salud del negocio. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { esquemaRespuestaSalud } from "@/lib/salud";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, cliente, compra, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let contador: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const medir = (u: string, org = ctx.orgId) => como(u, async () => (await db.query<{ r: unknown }>("select metricas_salud($1) r", [org])).rows[0]!.r);

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Salud SAS", "s@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@s.co", "vendedor");
  contador = await agregarMiembro(db, n.orgId, "c@s.co", "contador");
  const a = await producto(db, n.orgId, { nombre: "Cemento", precio: 3000 });
  await compra(db, ctx, [{ producto: a, cantidad: 10, costo: 1000 }]);
  const v: Ctx = { ...ctx, usuarioId: vendedor };
  const turno = await abrirTurno(db, v, 0);
  await venta(db, v, [{ producto: a, cantidad: 2, precio: 3000 }], { turno }); // ventas 6.000, costo 2.000
  await como(ctx.usuarioId, () => db.query("select ajustar_inventario($1,$2,$3,-1,'se dañó')", [n.orgId, a, n.bodegaId])); // merma 1.000
  await como(vendedor, () => db.query("select cerrar_turno($1, 5000, '{}'::jsonb)", [turno])); // esperado 6.000 → falta 1.000
  // Una deuda de hace 60 días: está vencida (el plazo por defecto es de 30).
  const deudor = await cliente(db, n.orgId, { nombre: "Don Pedro" });
  await como(ctx.usuarioId, () => db.query("select registrar_deuda_inicial($1, 4000, 'Cuaderno')", [deudor]));
  await db.transaction(async (tx) => {
    await tx.query("select set_config('surtix.desde_funcion','si',true)");
    await tx.query("update ajustes_cartera set creado_en = now() - interval '60 days' where cliente_id=$1", [deudor]);
  });
});
afterAll(async () => db.close());

describe("metricas_salud", () => {
  it("entrega las medidas crudas de los últimos 30 días", async () => {
    const r = esquemaRespuestaSalud.parse(await medir(ctx.usuarioId));
    expect(r.actual).toMatchObject({ ventas_n: 1, ventas_netas: 6000, utilidad: 4000, costo_ventas: 2000, merma: 1000, faltantes_caja: 1000, vencido: 4000, por_cobrar: 4000 });
    // 10 comprados − 2 vendidos − 1 de merma = 7 unidades a $ 1.000 de costo
    expect(r.actual.inventario_valor).toBe(7000);
    expect(r.anterior).toBeNull();
  });

  it("guarda la foto del día una sola vez (consultar de nuevo la actualiza, no la duplica)", async () => {
    await medir(ctx.usuarioId);
    await medir(ctx.usuarioId);
    const n = (await db.query<{ n: string }>("select count(*)::text n from salud_historial where organizacion_id=$1", [ctx.orgId])).rows[0]!.n;
    expect(n).toBe("1");
  });

  it("devuelve la foto más cercana a hace 30 días para la tendencia", async () => {
    await db.query("insert into salud_historial (organizacion_id, fecha, metricas) values ($1, (now() at time zone 'America/Bogota')::date - 31, $2::jsonb)", [
      ctx.orgId,
      JSON.stringify({ desde: "x", hasta: "y", ventas_n: 3, ventas_netas: 1000, utilidad: 100, costo_ventas: 900, inventario_valor: 0, vencido: 0, por_cobrar: 0, merma: 0, faltantes_caja: 0 }),
    ]);
    await db.query("insert into salud_historial (organizacion_id, fecha, metricas) values ($1, (now() at time zone 'America/Bogota')::date - 44, '{}'::jsonb)", [ctx.orgId]);
    const r = esquemaRespuestaSalud.parse(await medir(ctx.usuarioId));
    expect(r.anterior?.metricas.ventas_netas).toBe(1000);
  });

  it("lo ve el dueño y el contador; un vendedor no", async () => {
    await expect(medir(contador)).resolves.toBeTruthy();
    expect(await mensajeDeError(() => medir(vendedor))).toMatch(/Sin permiso/);
  });

  it("otro negocio no puede consultar éste, ni leer su historial", async () => {
    const otro = await crearNegocio(db, "Otro SAS", "o@x.co");
    expect(await mensajeDeError(() => medir(otro.duenoId))).toMatch(/Sin permiso/);
    expect(await como(otro.duenoId, async () => (await db.query("select id from salud_historial")).rows.length)).toBe(0);
  });

  it("un negocio nuevo y vacío no falla: todo en cero", async () => {
    const vacio = await crearNegocio(db, "Vacío SAS", "vacio@x.co");
    const r = esquemaRespuestaSalud.parse(await medir(vacio.duenoId, vacio.orgId));
    expect(r.actual).toMatchObject({ ventas_n: 0, ventas_netas: 0, utilidad: 0, inventario_valor: 0, vencido: 0 });
  });

  it("no se puede llamar a la función interna directamente", async () => {
    expect(await mensajeDeError(() => como(ctx.usuarioId, () => db.query("select calcular_metricas_salud($1, current_date)", [ctx.orgId])))).toMatch(/permission denied|permiso/i);
  });
});
