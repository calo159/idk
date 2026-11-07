/** Migración 0007: auditoría de cambios de precio en el POS. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, compra, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let otro: string;
let ventaId: string;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Precios SAS", "p@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@p.co", "vendedor");
  otro = await agregarMiembro(db, n.orgId, "o@p.co", "vendedor");
  const p = await producto(db, ctx.orgId, { precio: 1000 });
  await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 400 }]);
  const turno = await abrirTurno(db, { ...ctx, usuarioId: vendedor });
  ventaId = await venta(db, { ...ctx, usuarioId: vendedor }, [{ producto: p, cantidad: 1, precio: 800 }], { turno });
});
afterAll(async () => db.close());

const cambios = JSON.stringify([{ producto_id: "x", precio_catalogo: 1000, precio_cobrado: 800 }]);

describe("registrar_cambio_precio", () => {
  it("el vendedor de la venta deja el cambio en auditoría", async () => {
    await comoUsuario(db, vendedor, () => db.query("select registrar_cambio_precio($1, $2::jsonb)", [ventaId, cambios]));
    const r = await db.query<{ n: string }>(
      "select count(*)::text n from auditoria where registro_id = $1 and accion = 'precio_modificado'",
      [ventaId],
    );
    expect(r.rows[0]!.n).toBe("1");
  });
  it("otro vendedor no puede escribir auditoría de una venta ajena", async () => {
    const e = await comoUsuario(db, otro, () =>
      mensajeDeError(() => db.query("select registrar_cambio_precio($1, $2::jsonb)", [ventaId, cambios])),
    );
    expect(e).toMatch(/Sin permiso/);
  });
  it("rechaza cambios vacíos o mal formados", async () => {
    const e = await comoUsuario(db, vendedor, () =>
      mensajeDeError(() => db.query("select registrar_cambio_precio($1, '[]'::jsonb)", [ventaId])),
    );
    expect(e).toMatch(/inválidos/);
  });
  it("el anónimo no puede ejecutarla", async () => {
    const e = await mensajeDeError(() => db.query("select registrar_cambio_precio($1, '[]'::jsonb)", [ventaId]));
    expect(e).not.toBeNull();
  });
});
