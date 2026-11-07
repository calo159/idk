/** Migración 0008: hash perceptual, uso en otra venta, fecha antigua y alertas. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, comprobante, compra, eventos, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let p: string;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Verif SAS", "v@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "vend@v.co", "vendedor");
  p = await producto(db, n.orgId, { precio: 25000 });
  await compra(db, ctx, [{ producto: p, cantidad: 100, costo: 10000 }]);
});
afterAll(async () => db.close());

const verificar = (comp: string, monto: number, pago: string | null = null) =>
  comoUsuario(db, vendedor, async () => {
    const r = await db.query<{ e: string }>("select verificar_comprobante($1, $2, $3) as e", [comp, monto, pago]);
    return r.rows[0]!.e;
  });

const conPercep = async (hex: string, monto = 25000) => {
  const id = await comprobante(db, ctx.orgId, { monto });
  await db.query("update comprobantes set hash_perceptual = ('x' || $2)::bit(64) where id = $1", [id, hex]);
  return id;
};

describe("hash perceptual", () => {
  it("una captura casi idéntica (≤ 6 bits de diferencia) se detecta como repetida", async () => {
    await conPercep("f0f0f0f0f0f0f0f0");
    const casi = await conPercep("f0f0f0f0f0f0f0f3"); // 2 bits distintos
    expect(await verificar(casi, 25000)).toBe("sospechoso");
  });
  it("una imagen realmente distinta no se marca", async () => {
    await conPercep("00ff00ff00ff00ff");
    const otra = await conPercep("a5a5a5a5a5a5a5a5");
    expect(await verificar(otra, 25000)).toBe("verificado_ia");
  });
});

describe("uso en otra venta y fecha", () => {
  it("el mismo comprobante no respalda pagos de dos ventas", async () => {
    const c = await comprobante(db, ctx.orgId, { monto: 25000 });
    const turno = await abrirTurno(db, { ...ctx, usuarioId: vendedor });
    const v1 = await venta(db, { ...ctx, usuarioId: vendedor }, [{ producto: p, cantidad: 1, precio: 25000 }], {
      turno,
      pagos: [{ metodo: "nequi", monto: 25000, comprobante: c }],
    });
    const pago1 = (await db.query<{ id: string }>("select id from pagos_venta where venta_id=$1", [v1])).rows[0]!.id;
    // verificar el pago al que pertenece: limpio
    expect(await verificar(c, 25000, pago1)).toBe("verificado_ia");
    // otro pago (otra venta) intentando usar el mismo comprobante: sospechoso
    const v2 = await venta(db, { ...ctx, usuarioId: vendedor }, [{ producto: p, cantidad: 1, precio: 25000 }], {
      turno,
      pagos: [{ metodo: "efectivo", monto: 25000 }],
    });
    const pago2 = (await db.query<{ id: string }>("select id from pagos_venta where venta_id=$1", [v2])).rows[0]!.id;
    expect(await verificar(c, 25000, pago2)).toBe("sospechoso");
  });
  it("una fecha de hace 5 días es sospechosa; hoy no", async () => {
    const vieja = await comprobante(db, ctx.orgId, { monto: 1000 });
    await db.query("update comprobantes set fecha_leida = now() - interval '5 days' where id = $1", [vieja]);
    expect(await verificar(vieja, 1000)).toBe("sospechoso");
    const hoy = await comprobante(db, ctx.orgId, { monto: 1000 });
    await db.query("update comprobantes set fecha_leida = now() where id = $1", [hoy]);
    expect(await verificar(hoy, 1000)).toBe("verificado_ia");
  });
});

describe("alertas y permisos", () => {
  it("cada sospecha crea alerta de severidad alta y evento", async () => {
    const c = await comprobante(db, ctx.orgId, { monto: 111 });
    await verificar(c, 999);
    const a = await db.query<{ severidad: string; mensaje: string }>(
      "select severidad, mensaje from alertas where datos->>'comprobante_id' = $1",
      [c],
    );
    expect(a.rows[0]).toMatchObject({ severidad: "alta" });
    expect(a.rows[0]!.mensaje).toMatch(/monto/i);
    const ev = (await eventos(db, ctx.orgId, "comprobante.sospechoso")).find((e) => e.payload.comprobante_id === c);
    expect(ev?.payload.razon).toBe("monto_diferente");
  });
  it("un usuario de otro negocio no puede verificar comprobantes ajenos", async () => {
    const otro = await crearNegocio(db, "Otro SAS", "otro@x.co");
    const c = await comprobante(db, ctx.orgId, { monto: 5 });
    const e = await comoUsuario(db, otro.duenoId, () =>
      mensajeDeError(() => db.query("select verificar_comprobante($1, 5)", [c])),
    );
    expect(e).toMatch(/Sin acceso/);
  });
});
