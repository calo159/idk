/** Migración 0018: deudas iniciales de clientes (cuaderno de fiados). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, cliente } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let cli: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const saldo = async () => (await db.query<{ s: string }>("select saldo::text s from clientes where id=$1", [cli])).rows[0]!.s;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Deudas SAS", "d@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@d.co", "vendedor");
  cli = await cliente(db, n.orgId, { cupo: 100000 });
});
afterAll(async () => db.close());

describe("registrar_deuda_inicial", () => {
  it("suma al saldo, deja constancia y auditoría; los abonos posteriores la bajan", async () => {
    await como(ctx.usuarioId, () => db.query("select registrar_deuda_inicial($1, 85000, 'Cuaderno de don Pedro')", [cli]));
    expect(await saldo()).toBe("85000.00");
    const a = await db.query<{ monto: string; motivo: string }>("select monto::text, motivo from ajustes_cartera where cliente_id=$1", [cli]);
    expect(a.rows).toEqual([{ monto: "85000.00", motivo: "Cuaderno de don Pedro" }]);
    expect((await db.query("select 1 from auditoria where accion='deuda_inicial' and registro_id=$1", [cli])).rows).toHaveLength(1);

    const turno = await abrirTurno(db, { ...ctx, usuarioId: vendedor });
    await como(vendedor, () => db.query("select registrar_abono($1, 35000, 'efectivo', $2)", [cli, turno]));
    expect(await saldo()).toBe("50000.00");
  });

  it("solo dueño o admin; valida el monto; no sirve para clientes de otro negocio", async () => {
    expect(await como(vendedor, () => mensajeDeError(() => db.query("select registrar_deuda_inicial($1, 1000)", [cli])))).toMatch(/Solo dueño o admin/);
    expect(await como(ctx.usuarioId, () => mensajeDeError(() => db.query("select registrar_deuda_inicial($1, 0)", [cli])))).toMatch(/mayor a cero/);
    expect(await como(ctx.usuarioId, () => mensajeDeError(() => db.query("select registrar_deuda_inicial($1, 99999999999)", [cli])))).toMatch(/demasiado grande/);
    const otro = await crearNegocio(db, "Otro", "otro@x.co");
    expect(await como(otro.duenoId, () => mensajeDeError(() => db.query("select registrar_deuda_inicial($1, 1000)", [cli])))).toMatch(/Cliente no existe/);
  });

  it("el saldo no se puede editar a mano", async () => {
    await como(ctx.usuarioId, () => db.query("update clientes set saldo = 0 where id=$1", [cli])).catch(() => null);
    expect(Number(await saldo())).toBeGreaterThan(0);
  });
});
