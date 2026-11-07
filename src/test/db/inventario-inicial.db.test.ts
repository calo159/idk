/** Migración 0009: carga de inventario inicial en bloque. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, existencia, producto } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Inicial SAS", "i@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@i.co", "vendedor");
});
afterAll(async () => db.close());

const cargar = (usuario: string, lineas: unknown, bodega = ctx.bodegaId) =>
  comoUsuario(db, usuario, () =>
    db.query<{ n: number }>("select cargar_inventario_inicial($1, $2, $3::jsonb) as n", [ctx.orgId, bodega, JSON.stringify(lineas)]),
  );

describe("cargar_inventario_inicial", () => {
  it("crea movimientos 'inicial' con su costo y deja existencias y kardex correctos", async () => {
    const a = await producto(db, ctx.orgId);
    const b = await producto(db, ctx.orgId);
    const r = await cargar(ctx.usuarioId, [
      { producto_id: a, cantidad: 10.5, costo: 2000 },
      { producto_id: b, cantidad: 3, costo: 0 },
      { producto_id: b, cantidad: 0, costo: 5 }, // cantidad 0: se ignora
    ]);
    expect(r.rows[0]!.n).toBe(2);
    expect(await existencia(db, a, ctx.bodegaId)).toEqual({ cantidad: 10.5, costo: 2000 });
    expect((await existencia(db, b, ctx.bodegaId)).cantidad).toBe(3);
    const m = await db.query<{ tipo: string; saldo_cantidad: string }>(
      "select tipo, saldo_cantidad::text from movimientos_inventario where producto_id = $1",
      [a],
    );
    expect(m.rows).toEqual([{ tipo: "inicial", saldo_cantidad: "10.500" }]);
  });

  it("es atómica: una línea inválida deshace toda la carga", async () => {
    const ok = await producto(db, ctx.orgId);
    const otroNegocio = await crearNegocio(db, "Ajeno SAS", "ajeno@x.co");
    const ajeno = await producto(db, otroNegocio.orgId);
    const e = await mensajeDeError(() =>
      cargar(ctx.usuarioId, [
        { producto_id: ok, cantidad: 5, costo: 100 },
        { producto_id: ajeno, cantidad: 5, costo: 100 },
      ]),
    );
    expect(e).toMatch(/no pertenece/);
    expect((await existencia(db, ok, ctx.bodegaId)).cantidad).toBe(0);
  });

  it("el vendedor no puede cargar inventario", async () => {
    const p = await producto(db, ctx.orgId);
    const e = await mensajeDeError(() => cargar(vendedor, [{ producto_id: p, cantidad: 1, costo: 1 }]));
    expect(e).toMatch(/Sin permiso/);
  });

  it("rechaza bodega de otro negocio, costo negativo y entradas que no son arreglo", async () => {
    const p = await producto(db, ctx.orgId);
    const otro = await crearNegocio(db, "Bodega Ajena", "bodega@x.co");
    expect(await mensajeDeError(() => cargar(ctx.usuarioId, [], otro.bodegaId))).toMatch(/Bodega no existe/);
    expect(await mensajeDeError(() => cargar(ctx.usuarioId, [{ producto_id: p, cantidad: 1, costo: -1 }]))).toMatch(/negativo/);
    expect(await mensajeDeError(() => cargar(ctx.usuarioId, { producto_id: p }))).toMatch(/inválidas/);
  });

  it("deja auditoría de la carga", async () => {
    const r = await db.query<{ n: string }>(
      "select count(*)::text n from auditoria where organizacion_id = $1 and accion = 'inventario_inicial'",
      [ctx.orgId],
    );
    expect(Number(r.rows[0]!.n)).toBeGreaterThanOrEqual(1);
  });
});
