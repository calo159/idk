/**
 * Ventas: confirmar, pagos mixtos, crédito, anulación, idempotencia offline e inmutabilidad
 * (reglas #4, #5 y #6).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, cliente, compra, eventos, existencia, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx; // dueño
let vendedor: Ctx;
let adminId: string;
let contadorId: string;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Ferretería Ventas", "ventas@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = { ...ctx, usuarioId: await agregarMiembro(db, n.orgId, "vendedor@x.co", "vendedor") };
  adminId = await agregarMiembro(db, n.orgId, "admin@x.co", "admin");
  contadorId = await agregarMiembro(db, n.orgId, "contador@x.co", "contador");
});

afterAll(async () => {
  await db.close();
});

const stockDe = async (p: string) => (await existencia(db, p, ctx.bodegaId)).cantidad;
const numMov = async (p: string) =>
  Number(
    (
      await db.query<{ n: string }>(
        "select count(*) as n from movimientos_inventario where producto_id = $1",
        [p],
      )
    ).rows[0]!.n,
  );

async function productoConStock(precio = 10000, stock = 100, costo = 6000) {
  const p = await producto(db, ctx.orgId, { precio });
  await compra(db, ctx, [{ producto: p, cantidad: stock, costo }]);
  return p;
}

describe("confirmar venta", () => {
  it("numera de forma consecutiva por negocio y es idempotente", async () => {
    const p = await productoConStock();
    const v1 = await venta(db, vendedor, [{ producto: p, cantidad: 1, precio: 10000 }]);
    const v2 = await venta(db, vendedor, [{ producto: p, cantidad: 1, precio: 10000 }]);
    const num = async (id: string) =>
      Number(
        (await db.query<{ numero: string }>("select numero::text from ventas where id = $1", [id]))
          .rows[0]!.numero,
      );
    const n1 = await num(v1);
    expect(await num(v2)).toBe(n1 + 1);

    const antes = await numMov(p);
    const repetida = await comoUsuario(db, vendedor.usuarioId, () =>
      db.query<{ confirmar_venta: string }>("select confirmar_venta($1)", [v1]),
    );
    expect(Number(repetida.rows[0]!.confirmar_venta)).toBe(n1); // devuelve el mismo número
    expect(await numMov(p)).toBe(antes); // sin movimientos nuevos
    expect(await stockDe(p)).toBe(98);
  });

  it("los pagos deben sumar el total: si no, falla y no queda nada a medias", async () => {
    const p = await productoConStock();
    const antes = await numMov(p);
    const msg = await mensajeDeError(() =>
      venta(db, vendedor, [{ producto: p, cantidad: 2, precio: 10000 }], {
        pagos: [{ metodo: "efectivo", monto: 15000 }],
      }),
    );
    expect(msg).toMatch(/no suman el total/);
    expect(await numMov(p)).toBe(antes);
    expect(await stockDe(p)).toBe(100);
  });

  it("pagos mixtos (efectivo + Nequi + tarjeta) con descuento global", async () => {
    const p = await productoConStock();
    const v = await venta(db, vendedor, [{ producto: p, cantidad: 3, precio: 10000 }], {
      descuento: 2000,
      pagos: [
        { metodo: "efectivo", monto: 10000 },
        { metodo: "nequi", monto: 12000 },
        { metodo: "tarjeta", monto: 6000 },
      ],
    });
    const r = await db.query<{ subtotal: string; descuento: string; total: string }>(
      "select subtotal::text, descuento::text, total::text from ventas where id = $1",
      [v],
    );
    expect(r.rows[0]).toEqual({ subtotal: "30000.00", descuento: "2000.00", total: "28000.00" });
  });

  it("descuento por línea reduce el subtotal de la línea", async () => {
    const p = await productoConStock();
    const v = await venta(db, vendedor, [
      { producto: p, cantidad: 2, precio: 10000, descuento: 1500 },
    ]);
    const r = await db.query<{ total: string }>("select total::text from ventas where id = $1", [
      v,
    ]);
    expect(r.rows[0]!.total).toBe("18500.00");
  });

  it("solo dueño, admin, vendedor y ruta confirman ventas; el contador no", async () => {
    const p = await productoConStock();
    const v = await venta(db, vendedor, [{ producto: p, cantidad: 1, precio: 10000 }], {
      confirmar: false,
    });
    const msg = await comoUsuario(db, contadorId, () =>
      mensajeDeError(() => db.query("select confirmar_venta($1)", [v])),
    );
    expect(msg).toMatch(/Sin permiso/);
    await comoUsuario(db, adminId, () => db.query("select confirmar_venta($1)", [v]));
    expect(await stockDe(p)).toBe(99);
  });

  it("v_ventas_dia suma ventas y utilidad (solo confirmadas)", async () => {
    const n = await crearNegocio(db, "Solo reporte", "rep@x.co");
    const c: Ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
    const p = await producto(db, n.orgId);
    await compra(db, c, [{ producto: p, cantidad: 50, costo: 6000 }]);
    await venta(db, c, [{ producto: p, cantidad: 2, precio: 10000 }]); // utilidad 8.000
    await venta(db, c, [{ producto: p, cantidad: 1, precio: 10000 }]); // utilidad 4.000
    await venta(db, c, [{ producto: p, cantidad: 1, precio: 10000 }], { confirmar: false }); // borrador: no cuenta
    const r = await db.query<{ numero_ventas: string; total: string; utilidad: string }>(
      "select numero_ventas::text, total::text, utilidad::text from v_ventas_dia where organizacion_id = $1",
      [n.orgId],
    );
    expect(r.rows).toEqual([{ numero_ventas: "2", total: "30000.00", utilidad: "12000.00" }]);
  });
});

describe("crédito (fiado)", () => {
  it("exige cliente", async () => {
    const p = await productoConStock();
    const msg = await mensajeDeError(() =>
      venta(db, vendedor, [{ producto: p, cantidad: 1, precio: 10000 }], {
        pagos: [{ metodo: "credito", monto: 10000 }],
      }),
    );
    expect(msg).toMatch(/necesita cliente/);
  });

  it("suma al saldo del cliente; dentro del cupo no genera alerta", async () => {
    const p = await productoConStock();
    const c = await cliente(db, ctx.orgId, { cupo: 100000 });
    await venta(db, vendedor, [{ producto: p, cantidad: 3, precio: 10000 }], {
      cliente: c,
      pagos: [
        { metodo: "efectivo", monto: 5000 },
        { metodo: "credito", monto: 25000 },
      ],
    });
    const r = await db.query<{ saldo: string }>("select saldo::text from clientes where id = $1", [
      c,
    ]);
    expect(r.rows[0]!.saldo).toBe("25000.00");
    const alertas = await db.query("select 1 from alertas where datos->>'cliente_id' = $1", [c]);
    expect(alertas.rows).toHaveLength(0);
  });

  it("por encima del cupo permite la venta pero deja alerta cupo_excedido", async () => {
    const p = await productoConStock();
    const c = await cliente(db, ctx.orgId, { cupo: 10000 });
    await venta(db, vendedor, [{ producto: p, cantidad: 3, precio: 10000 }], {
      cliente: c,
      pagos: [{ metodo: "credito", monto: 30000 }],
    });
    const alertas = await db.query<{ tipo: string }>(
      "select tipo from alertas where datos->>'cliente_id' = $1",
      [c],
    );
    expect(alertas.rows).toEqual([{ tipo: "cupo_excedido" }]);
  });

  it("el saldo no se edita a mano; los abonos lo reducen y un abono no puede ser a crédito", async () => {
    const p = await productoConStock();
    const c = await cliente(db, ctx.orgId, { cupo: 100000 });
    await venta(db, vendedor, [{ producto: p, cantidad: 4, precio: 10000 }], {
      cliente: c,
      pagos: [{ metodo: "credito", monto: 40000 }],
    });
    const msg = await comoUsuario(db, ctx.usuarioId, () =>
      mensajeDeError(() => db.query("update clientes set saldo = 0 where id = $1", [c])),
    );
    expect(msg).toMatch(/solo cambia con ventas a crédito y abonos/);
    expect(
      await comoUsuario(db, ctx.usuarioId, () =>
        mensajeDeError(() =>
          cliente(db, ctx.orgId).then(() =>
            db.query(
              "insert into clientes (organizacion_id, nombre, saldo) values ($1, 'Trampa', 5000)",
              [ctx.orgId],
            ),
          ),
        ),
      ),
    ).toMatch(/saldo inicial/);

    await comoUsuario(db, vendedor.usuarioId, async () => {
      await db.query("select registrar_abono($1, 15000, 'nequi')", [c]);
      expect(
        await mensajeDeError(() => db.query("select registrar_abono($1, 1000, 'credito')", [c])),
      ).toMatch(/no puede ser a crédito/);
      expect(
        await mensajeDeError(() => db.query("select registrar_abono($1, 0, 'efectivo')", [c])),
      ).not.toBeNull();
    });
    const r = await db.query<{ saldo: string }>("select saldo::text from clientes where id = $1", [
      c,
    ]);
    expect(r.rows[0]!.saldo).toBe("25000.00");
  });
});

describe("anular venta (regla #4)", () => {
  it("devuelve el inventario al costo original, revierte el fiado, audita y avisa", async () => {
    const p = await productoConStock(10000, 20, 6000);
    const c = await cliente(db, ctx.orgId, { cupo: 100000 });
    const v = await venta(db, vendedor, [{ producto: p, cantidad: 5, precio: 10000 }], {
      cliente: c,
      pagos: [{ metodo: "credito", monto: 50000 }],
    });
    expect(await stockDe(p)).toBe(15);

    await comoUsuario(db, ctx.usuarioId, () =>
      db.query("select anular_venta($1, 'cliente se arrepintió')", [v]),
    );

    expect(await stockDe(p)).toBe(20);
    expect((await existencia(db, p, ctx.bodegaId)).costo).toBe(6000);
    const cli = await db.query<{ saldo: string }>(
      "select saldo::text from clientes where id = $1",
      [c],
    );
    expect(cli.rows[0]!.saldo).toBe("0.00");

    const venta_ = await db.query<{
      estado: string;
      motivo_anulacion: string;
      anulada_por: string;
    }>("select estado, motivo_anulacion, anulada_por from ventas where id = $1", [v]);
    expect(venta_.rows[0]).toEqual({
      estado: "anulado",
      motivo_anulacion: "cliente se arrepintió",
      anulada_por: ctx.usuarioId,
    });

    // los movimientos originales siguen ahí + un movimiento contrario por cada uno (nada se borra)
    const tipos = await db.query<{ tipo: string }>(
      "select tipo from movimientos_inventario where documento_tipo = 'venta' and documento_id = $1 order by id",
      [v],
    );
    expect(tipos.rows.map((x) => x.tipo)).toEqual(["venta", "anulacion_entrada"]);

    const aud = await db.query<{ accion: string; usuario_id: string }>(
      "select accion, usuario_id from auditoria where tabla = 'ventas' and registro_id = $1",
      [v],
    );
    expect(aud.rows).toEqual([{ accion: "anular", usuario_id: ctx.usuarioId }]);
    const ev = (await eventos(db, ctx.orgId, "venta.anulada")).find(
      (e) => e.payload.venta_id === v,
    );
    expect(ev?.payload).toMatchObject({ motivo: "cliente se arrepintió", total: 50000 });
    expect(typeof ev?.payload.minutos_desde_venta).toBe("number");
  });

  it("exige motivo, solo dueño/admin, una sola vez y solo ventas confirmadas", async () => {
    const p = await productoConStock();
    const v = await venta(db, vendedor, [{ producto: p, cantidad: 1, precio: 10000 }]);
    const borrador = await venta(db, vendedor, [{ producto: p, cantidad: 1, precio: 10000 }], {
      confirmar: false,
    });

    expect(
      await comoUsuario(db, ctx.usuarioId, () =>
        mensajeDeError(() => db.query("select anular_venta($1, '  ')", [v])),
      ),
    ).toMatch(/motivo es obligatorio/);
    // el vendedor y el contador no pueden anular
    for (const quien of [vendedor.usuarioId, contadorId]) {
      expect(
        await comoUsuario(db, quien, () =>
          mensajeDeError(() => db.query("select anular_venta($1, 'x')", [v])),
        ),
      ).toMatch(/Solo dueño o admin/);
    }
    expect(
      await comoUsuario(db, ctx.usuarioId, () =>
        mensajeDeError(() => db.query("select anular_venta($1, 'x')", [borrador])),
      ),
    ).toMatch(/Solo se anulan ventas confirmadas/);
    await comoUsuario(db, adminId, () =>
      db.query("select anular_venta($1, 'error de digitación')", [v]),
    );
    expect(
      await comoUsuario(db, ctx.usuarioId, () =>
        mensajeDeError(() => db.query("select anular_venta($1, 'otra vez')", [v])),
      ),
    ).toMatch(/Solo se anulan ventas confirmadas/);
    expect(await stockDe(p)).toBe(100); // 100 inicial: la anulada volvió, la de borrador no descontó
  });

  it("una venta anulada no se puede confirmar de nuevo", async () => {
    const p = await productoConStock();
    const v = await venta(db, vendedor, [{ producto: p, cantidad: 1, precio: 10000 }]);
    await comoUsuario(db, ctx.usuarioId, () => db.query("select anular_venta($1, 'x')", [v]));
    expect(
      await comoUsuario(db, ctx.usuarioId, () =>
        mensajeDeError(() => db.query("select confirmar_venta($1)", [v])),
      ),
    ).toMatch(/está anulada/);
  });
});

describe("ventas offline (regla #5): offline_id evita duplicados", () => {
  it("la misma venta sincronizada dos veces no se duplica ni descuenta dos veces", async () => {
    const p = await productoConStock();
    const offlineId = randomUUID();
    await venta(db, vendedor, [{ producto: p, cantidad: 2, precio: 10000 }], { offlineId });
    const msg = await mensajeDeError(() =>
      venta(db, vendedor, [{ producto: p, cantidad: 2, precio: 10000 }], { offlineId }),
    );
    expect(msg).toMatch(/duplicate key|unique/i);
    const n = await db.query<{ n: string }>(
      "select count(*) as n from ventas where offline_id = $1",
      [offlineId],
    );
    expect(Number(n.rows[0]!.n)).toBe(1);
    expect(await stockDe(p)).toBe(98);
  });

  it("el mismo offline_id en otro negocio es otra venta (el índice es por negocio)", async () => {
    const otro = await crearNegocio(db, "Otro", "otro-offline@x.co");
    const c2: Ctx = { orgId: otro.orgId, usuarioId: otro.duenoId, bodegaId: otro.bodegaId };
    const p1 = await productoConStock();
    const p2 = await producto(db, otro.orgId);
    const offlineId = randomUUID();
    await venta(db, vendedor, [{ producto: p1, cantidad: 1, precio: 10000 }], { offlineId });
    await venta(db, c2, [{ producto: p2, cantidad: 1, precio: 10000 }], { offlineId });
  });

  it("el movimiento de inventario conserva el offline_id (trazabilidad)", async () => {
    const p = await productoConStock();
    const offlineId = randomUUID();
    await venta(db, vendedor, [{ producto: p, cantidad: 1, precio: 10000 }], { offlineId });
    const r = await db.query<{ offline_id: string }>(
      "select offline_id from movimientos_inventario where producto_id = $1 and tipo = 'venta'",
      [p],
    );
    expect(r.rows[0]!.offline_id).toBe(offlineId);
  });
});

describe("documentos confirmados son inmutables (regla #4)", () => {
  it("no se edita, no se cambia el estado a mano, no se tocan detalle ni pagos", async () => {
    const p = await productoConStock();
    const v = await venta(db, vendedor, [{ producto: p, cantidad: 1, precio: 10000 }]);
    await comoUsuario(db, vendedor.usuarioId, async () => {
      expect(
        await mensajeDeError(() =>
          db.query("update ventas set descuento = 5000 where id = $1", [v]),
        ),
      ).toMatch(/confirmado no se edita/);
      expect(
        await mensajeDeError(() =>
          db.query("update ventas set estado = 'anulado' where id = $1", [v]),
        ),
      ).toMatch(/solo cambia con confirmar\/anular/);
      expect(
        await mensajeDeError(() =>
          db.query("update ventas_detalle set cantidad = 99 where venta_id = $1", [v]),
        ),
      ).toMatch(/No se puede modificar el detalle/);
      // no hay política de DELETE: la fila simplemente no es visible para borrar
      const borrado = await db.query("delete from ventas_detalle where venta_id = $1", [v]);
      expect(borrado.affectedRows).toBe(0);
      expect(
        await mensajeDeError(() =>
          db.query("update pagos_venta set monto = 1 where venta_id = $1", [v]),
        ),
      ).toMatch(/No se puede modificar el detalle/);
      expect(
        await mensajeDeError(() =>
          db.query(
            "insert into ventas_detalle (organizacion_id, venta_id, producto_id, cantidad, precio_unitario) values ($1,$2,$3,1,1)",
            [ctx.orgId, v, p],
          ),
        ),
      ).toMatch(/No se puede modificar el detalle/);
      // y no se puede crear un documento ya "confirmado" saltándose la función
      expect(
        await mensajeDeError(() =>
          db.query(
            "insert into ventas (organizacion_id, bodega_id, estado) values ($1, $2, 'confirmado')",
            [ctx.orgId, ctx.bodegaId],
          ),
        ),
      ).toMatch(/se crean en borrador/);
      // ni borrar la venta (no hay política de DELETE)
      const d = await db.query("delete from ventas where id = $1", [v]);
      expect(d.affectedRows).toBe(0);
    });
    expect(await stockDe(p)).toBe(99);
  });

  it("un pago no puede nacer 'verificado' desde el cliente: lo asigna el sistema", async () => {
    const p = await productoConStock();
    const v = await venta(db, vendedor, [{ producto: p, cantidad: 1, precio: 10000 }], {
      confirmar: false,
    });
    const msg = await comoUsuario(db, vendedor.usuarioId, () =>
      mensajeDeError(() =>
        db.query(
          "insert into pagos_venta (organizacion_id, venta_id, metodo, monto, verificacion) values ($1,$2,'nequi',10000,'verificado_ia')",
          [ctx.orgId, v],
        ),
      ),
    );
    expect(msg).toMatch(/asigna el sistema/);
  });

  it("compras confirmadas tampoco se editan", async () => {
    const p = await producto(db, ctx.orgId);
    const c = await compra(db, ctx, [{ producto: p, cantidad: 5, costo: 100 }]);
    await comoUsuario(db, ctx.usuarioId, async () => {
      expect(
        await mensajeDeError(() =>
          db.query("update compras set numero_factura = 'X' where id = $1", [c]),
        ),
      ).toMatch(/confirmado no se edita/);
      expect(
        await mensajeDeError(() =>
          db.query("update compras_detalle set cantidad = 99 where compra_id = $1", [c]),
        ),
      ).toMatch(/No se puede modificar el detalle/);
    });
  });
});
