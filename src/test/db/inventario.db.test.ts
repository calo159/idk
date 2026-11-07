/**
 * Inventario por movimientos + costo promedio ponderado + kardex (CLAUDE.md reglas #1 y #4).
 * Un error aquí le cuesta plata real al cliente: es la parte más probada del sistema.
 */
import Decimal from "decimal.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { costoPromedioPonderado, sumar } from "@/lib/dinero";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import {
  type Ctx,
  compra,
  eventos,
  existencia,
  presentacion,
  producto,
  proveedor,
  venta,
} from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedorId: string;
let bodegueroId: string;
let contadorId: string;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Ferretería Prueba", "inv@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedorId = await agregarMiembro(db, n.orgId, "vendedor@x.co", "vendedor");
  bodegueroId = await agregarMiembro(db, n.orgId, "bodeguero@x.co", "bodeguero");
  contadorId = await agregarMiembro(db, n.orgId, "contador@x.co", "contador");
});

afterAll(async () => {
  await db.close();
});

const movimientos = async (productoId: string) =>
  (
    await db.query<{
      tipo: string;
      cantidad: string;
      costo_unitario: string;
      saldo_cantidad: string;
      saldo_costo_promedio: string;
      documento_tipo: string | null;
    }>(
      `select tipo, cantidad::text, costo_unitario::text, saldo_cantidad::text,
              saldo_costo_promedio::text, documento_tipo
         from movimientos_inventario where producto_id = $1 order by id`,
      [productoId],
    )
  ).rows;

describe("compras: entradas y costo promedio ponderado", () => {
  it("confirmar una compra crea la entrada y fija el costo", async () => {
    const p = await producto(db, ctx.orgId);
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 5000 }]);
    expect(await existencia(db, p, ctx.bodegaId)).toEqual({ cantidad: 10, costo: 5000 });
    const m = await movimientos(p);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ tipo: "compra", cantidad: "10.000", documento_tipo: "compra" });
  });

  it("una segunda compra a otro precio promedia ponderado: 10@5.000 + 10@7.000 = 20@6.000", async () => {
    const p = await producto(db, ctx.orgId);
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 5000 }]);
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 7000 }]);
    expect(await existencia(db, p, ctx.bodegaId)).toEqual({ cantidad: 20, costo: 6000 });
  });

  it("pondera por cantidades distintas y redondea a 2 decimales", async () => {
    const p = await producto(db, ctx.orgId);
    await compra(db, ctx, [{ producto: p, cantidad: 3, costo: 100 }]);
    await compra(db, ctx, [{ producto: p, cantidad: 1, costo: 101 }]);
    expect(await existencia(db, p, ctx.bodegaId)).toEqual({ cantidad: 4, costo: 100.25 });
    await compra(db, ctx, [{ producto: p, cantidad: 2, costo: 100 }]);
    // (4*100.25 + 2*100) / 6 = 100.1666… → 100.17
    expect((await existencia(db, p, ctx.bodegaId)).costo).toBe(100.17);
  });

  it("las salidas se valoran al costo promedio y NO lo alteran; la siguiente compra lo recalcula", async () => {
    const p = await producto(db, ctx.orgId, { precio: 10000 });
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 5000 }]);
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 7000 }]);
    const v = await venta(db, ctx, [{ producto: p, cantidad: 5, precio: 10000 }]);

    expect(await existencia(db, p, ctx.bodegaId)).toEqual({ cantidad: 15, costo: 6000 });
    const salida = (await movimientos(p)).find((m) => m.tipo === "venta")!;
    expect(salida.costo_unitario).toBe("6000.00");

    const cab = await db.query<{ costo_total: string; total: string }>(
      "select costo_total::text, total::text from ventas where id = $1",
      [v],
    );
    expect(cab.rows[0]).toEqual({ costo_total: "30000.00", total: "50000.00" });
    const det = await db.query<{ costo_unitario: string }>(
      "select costo_unitario::text from ventas_detalle where venta_id = $1",
      [v],
    );
    expect(det.rows[0]!.costo_unitario).toBe("6000.00");

    await compra(db, ctx, [{ producto: p, cantidad: 5, costo: 9000 }]);
    // (15*6000 + 5*9000) / 20 = 6750
    expect(await existencia(db, p, ctx.bodegaId)).toEqual({ cantidad: 20, costo: 6750 });
  });

  it("el kardex guarda el saldo y el costo promedio después de cada movimiento", async () => {
    const p = await producto(db, ctx.orgId, { precio: 9000 });
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 4000 }]);
    await venta(db, ctx, [{ producto: p, cantidad: 3, precio: 9000 }]);
    await compra(db, ctx, [{ producto: p, cantidad: 7, costo: 6000 }]);
    const m = await movimientos(p);
    expect(m.map((x) => [x.tipo, x.saldo_cantidad, x.saldo_costo_promedio])).toEqual([
      ["compra", "10.000", "4000.00"],
      ["venta", "7.000", "4000.00"],
      ["compra", "14.000", "5000.00"], // (7*4000 + 7*6000)/14
    ]);
  });

  it("una entrada sin costo (ajuste) suma unidades pero no cambia el costo promedio", async () => {
    const p = await producto(db, ctx.orgId);
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 5000 }]);
    await comoUsuario(db, ctx.usuarioId, () =>
      db.query("select ajustar_inventario($1, $2, $3, 5, 'sobrante en conteo')", [
        ctx.orgId,
        p,
        ctx.bodegaId,
      ]),
    );
    expect(await existencia(db, p, ctx.bodegaId)).toEqual({ cantidad: 15, costo: 5000 });
  });

  it("si el stock estaba en cero o negativo, el costo pasa a ser el de la nueva entrada", async () => {
    const p = await producto(db, ctx.orgId, { precio: 100 });
    await venta(db, ctx, [{ producto: p, cantidad: 4, precio: 100 }]); // stock -4
    expect((await existencia(db, p, ctx.bodegaId)).cantidad).toBe(-4);
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 1200 }]);
    expect(await existencia(db, p, ctx.bodegaId)).toEqual({ cantidad: 6, costo: 1200 });
  });

  it("presentaciones: 2 cajas x12 a $120.000 entran como 24 unidades a $10.000", async () => {
    const p = await producto(db, ctx.orgId, { precio: 12000 });
    const caja = await presentacion(db, ctx.orgId, p, "Caja x12", 12, 130000);
    await compra(db, ctx, [{ producto: p, cantidad: 2, costo: 120000, presentacion: caja }]);
    expect(await existencia(db, p, ctx.bodegaId)).toEqual({ cantidad: 24, costo: 10000 });

    // vender 1 caja descuenta 12 unidades; el costo de la línea es el de la caja (12 × 10.000)
    const v = await venta(db, ctx, [
      { producto: p, cantidad: 1, precio: 130000, presentacion: caja },
    ]);
    expect(await existencia(db, p, ctx.bodegaId)).toEqual({ cantidad: 12, costo: 10000 });
    const det = await db.query<{ costo_unitario: string }>(
      "select costo_unitario::text from ventas_detalle where venta_id = $1",
      [v],
    );
    expect(det.rows[0]!.costo_unitario).toBe("120000.00");
    const cab = await db.query<{ costo_total: string }>(
      "select costo_total::text from ventas where id = $1",
      [v],
    );
    expect(cab.rows[0]!.costo_total).toBe("120000.00");
  });

  it("vender por metros (cantidades decimales)", async () => {
    const p = await producto(db, ctx.orgId, { unidad: "metro", precio: 3500 });
    await compra(db, ctx, [{ producto: p, cantidad: 100, costo: 2000 }]);
    const v = await venta(db, ctx, [{ producto: p, cantidad: 2.5, precio: 3500 }]);
    expect(await existencia(db, p, ctx.bodegaId)).toEqual({ cantidad: 97.5, costo: 2000 });
    const cab = await db.query<{ total: string; costo_total: string }>(
      "select total::text, costo_total::text from ventas where id = $1",
      [v],
    );
    expect(cab.rows[0]).toEqual({ total: "8750.00", costo_total: "5000.00" });
  });

  it("guarda el historial de precios por proveedor (costo por unidad base)", async () => {
    const p = await producto(db, ctx.orgId);
    const prov = await proveedor(db, ctx.orgId);
    const caja = await presentacion(db, ctx.orgId, p, "Caja x10", 10, 1);
    await compra(db, ctx, [{ producto: p, cantidad: 1, costo: 50000, presentacion: caja }], {
      proveedor: prov,
    });
    const r = await db.query<{ costo_unitario_base: string }>(
      "select costo_unitario_base::text from precios_proveedor where producto_id = $1 and proveedor_id = $2",
      [p, prov],
    );
    expect(r.rows.map((x) => x.costo_unitario_base)).toEqual(["5000.00"]);
  });
});

describe("compras: reglas de documento", () => {
  it("no se puede confirmar dos veces (no duplica entradas)", async () => {
    const p = await producto(db, ctx.orgId);
    const c = await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 100 }]);
    const msg = await comoUsuario(db, ctx.usuarioId, () =>
      mensajeDeError(() => db.query("select confirmar_compra($1)", [c])),
    );
    expect(msg).toMatch(/ya fue confirmada/);
    expect((await existencia(db, p, ctx.bodegaId)).cantidad).toBe(10);
  });

  it("solo dueño, admin y bodeguero confirman compras; vendedor y contador no", async () => {
    const p = await producto(db, ctx.orgId);
    const c = await compra(db, ctx, [{ producto: p, cantidad: 1, costo: 100 }], {
      confirmar: false,
    });
    for (const quien of [vendedorId, contadorId]) {
      const msg = await comoUsuario(db, quien, () =>
        mensajeDeError(() => db.query("select confirmar_compra($1)", [c])),
      );
      expect(msg).toMatch(/Sin permiso/);
    }
    await comoUsuario(db, bodegueroId, () => db.query("select confirmar_compra($1)", [c]));
    expect((await existencia(db, p, ctx.bodegaId)).cantidad).toBe(1);
  });

  it("el total de la compra se calcula con el detalle", async () => {
    const p1 = await producto(db, ctx.orgId);
    const p2 = await producto(db, ctx.orgId);
    const c = await compra(db, ctx, [
      { producto: p1, cantidad: 3, costo: 3333.33 },
      { producto: p2, cantidad: 2.5, costo: 1000 },
    ]);
    const r = await db.query<{ total: string }>("select total::text from compras where id = $1", [
      c,
    ]);
    expect(r.rows[0]!.total).toBe(sumar(9999.99, 2500).toFixed(2));
  });

  it("una línea de compra no puede usar la presentación de otro producto", async () => {
    const p1 = await producto(db, ctx.orgId);
    const p2 = await producto(db, ctx.orgId);
    const cajaDeP2 = await presentacion(db, ctx.orgId, p2, "Caja x100", 100, 1);
    const msg = await mensajeDeError(() =>
      compra(db, ctx, [{ producto: p1, cantidad: 1, costo: 100, presentacion: cajaDeP2 }], {
        confirmar: false,
      }),
    );
    expect(msg).toMatch(/presentación no corresponde/);
  });
});

describe("stock negativo y alertas", () => {
  it("si el negocio lo permite, vende sin stock y deja alerta stock.negativo", async () => {
    const p = await producto(db, ctx.orgId, { precio: 500 });
    await venta(db, ctx, [{ producto: p, cantidad: 3, precio: 500 }]);
    expect((await existencia(db, p, ctx.bodegaId)).cantidad).toBe(-3);
    const ev = (await eventos(db, ctx.orgId, "stock.negativo")).filter(
      (e) => e.payload.producto_id === p,
    );
    expect(ev).toHaveLength(1);
  });

  it("si el negocio NO lo permite, la venta falla completa y no cambia nada", async () => {
    const n2 = await crearNegocio(db, "Estricta", "estricta@x.co");
    const c2: Ctx = { orgId: n2.orgId, usuarioId: n2.duenoId, bodegaId: n2.bodegaId };
    await comoUsuario(db, n2.duenoId, () =>
      db.query("update organizaciones set permite_stock_negativo = false where id = $1", [
        n2.orgId,
      ]),
    );
    const p = await producto(db, n2.orgId, { precio: 500 });
    await compra(db, c2, [{ producto: p, cantidad: 2, costo: 100 }]);
    const msg = await mensajeDeError(() =>
      venta(db, c2, [{ producto: p, cantidad: 3, precio: 500 }]),
    );
    expect(msg).toMatch(/Stock insuficiente/);
    expect((await existencia(db, p, n2.bodegaId)).cantidad).toBe(2);
    // y la venta que se intentó no quedó confirmada
    const r = await db.query(
      "select 1 from ventas where organizacion_id = $1 and estado = 'confirmado'",
      [n2.orgId],
    );
    expect(r.rows).toHaveLength(0);
  });

  it("alerta stock.bajo una sola vez al cruzar el mínimo", async () => {
    const p = await producto(db, ctx.orgId, { precio: 100, minimo: 5 });
    await compra(db, ctx, [{ producto: p, cantidad: 8, costo: 50 }]);
    await venta(db, ctx, [{ producto: p, cantidad: 2, precio: 100 }]); // 6 (> mínimo)
    expect(
      (await eventos(db, ctx.orgId, "stock.bajo")).filter((e) => e.payload.producto_id === p),
    ).toHaveLength(0);
    await venta(db, ctx, [{ producto: p, cantidad: 2, precio: 100 }]); // 4 (<= mínimo) → alerta
    await venta(db, ctx, [{ producto: p, cantidad: 1, precio: 100 }]); // 3 (ya estaba bajo) → sin repetir
    const ev = (await eventos(db, ctx.orgId, "stock.bajo")).filter(
      (e) => e.payload.producto_id === p,
    );
    expect(ev).toHaveLength(1);
    expect(ev[0]!.payload).toMatchObject({ cantidad: 4, minimo: 5 });
  });

  it("un producto que no maneja inventario (servicio) no genera movimientos", async () => {
    const s = await producto(db, ctx.orgId, {
      nombre: "Corte de varilla",
      precio: 2000,
      manejaInventario: false,
    });
    const v = await venta(db, ctx, [{ producto: s, cantidad: 3, precio: 2000 }]);
    expect(await movimientos(s)).toHaveLength(0);
    const r = await db.query<{ costo_total: string; total: string }>(
      "select costo_total::text, total::text from ventas where id = $1",
      [v],
    );
    expect(r.rows[0]).toEqual({ costo_total: "0.00", total: "6000.00" });
  });
});

describe("movimientos inmutables y stock protegido (regla #1)", () => {
  it("UPDATE y DELETE de movimientos fallan aunque sea superusuario", async () => {
    const p = await producto(db, ctx.orgId);
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 100 }]);
    expect(
      await mensajeDeError(() =>
        db.query("update movimientos_inventario set cantidad = 999 where producto_id = $1", [p]),
      ),
    ).toMatch(/no se modifican ni se borran/);
    expect(
      await mensajeDeError(() =>
        db.query("delete from movimientos_inventario where producto_id = $1", [p]),
      ),
    ).toMatch(/no se modifican ni se borran/);
    expect((await existencia(db, p, ctx.bodegaId)).cantidad).toBe(10);
  });

  it("un usuario autenticado no puede editar existencias ni insertar movimientos directamente", async () => {
    const p = await producto(db, ctx.orgId);
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 100 }]);
    await comoUsuario(db, ctx.usuarioId, async () => {
      const u = await db.query("update existencias set cantidad = 9999 where producto_id = $1", [
        p,
      ]);
      expect(u.affectedRows).toBe(0);
      const msg = await mensajeDeError(() =>
        db.query(
          `insert into movimientos_inventario (organizacion_id, producto_id, bodega_id, tipo, cantidad)
           values ($1, $2, $3, 'ajuste_entrada', 500)`,
          [ctx.orgId, p, ctx.bodegaId],
        ),
      );
      expect(msg).toMatch(/row-level security/i);
    });
    expect((await existencia(db, p, ctx.bodegaId)).cantidad).toBe(10);
  });
});

describe("ajustes de inventario", () => {
  it("exigen motivo y no hacen nada con cantidad 0", async () => {
    const p = await producto(db, ctx.orgId);
    await comoUsuario(db, ctx.usuarioId, async () => {
      expect(
        await mensajeDeError(() =>
          db.query("select ajustar_inventario($1,$2,$3,5,'  ')", [ctx.orgId, p, ctx.bodegaId]),
        ),
      ).toMatch(/motivo es obligatorio/);
      await db.query("select ajustar_inventario($1,$2,$3,0,'nada')", [ctx.orgId, p, ctx.bodegaId]);
    });
    expect(await movimientos(p)).toHaveLength(0);
  });

  it("ajuste de salida resta, queda en auditoría y el motivo en el kardex", async () => {
    const p = await producto(db, ctx.orgId);
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 1000 }]);
    await comoUsuario(db, ctx.usuarioId, () =>
      db.query("select ajustar_inventario($1,$2,$3,-2,'producto dañado')", [
        ctx.orgId,
        p,
        ctx.bodegaId,
      ]),
    );
    expect((await existencia(db, p, ctx.bodegaId)).cantidad).toBe(8);
    const m = await db.query<{ tipo: string; motivo: string }>(
      "select tipo, motivo from movimientos_inventario where producto_id = $1 and documento_tipo = 'ajuste'",
      [p],
    );
    expect(m.rows).toEqual([{ tipo: "ajuste_salida", motivo: "producto dañado" }]);
    const a = await db.query(
      "select 1 from auditoria where registro_id = $1 and accion = 'ajuste'",
      [p],
    );
    expect(a.rows).toHaveLength(1);
  });

  it("un ajuste negativo grande (≥ umbral) genera el evento ajuste.grande; uno pequeño no", async () => {
    const p = await producto(db, ctx.orgId);
    await compra(db, ctx, [{ producto: p, cantidad: 100, costo: 15000 }]);
    await comoUsuario(db, ctx.usuarioId, async () => {
      await db.query("select ajustar_inventario($1,$2,$3,-1,'pequeño')", [
        ctx.orgId,
        p,
        ctx.bodegaId,
      ]); // 15.000
      await db.query("select ajustar_inventario($1,$2,$3,-10,'grande')", [
        ctx.orgId,
        p,
        ctx.bodegaId,
      ]); // 150.000 ≥ 100.000
    });
    const ev = (await eventos(db, ctx.orgId, "ajuste.grande")).filter(
      (e) => e.payload.producto_id === p,
    );
    expect(ev).toHaveLength(1);
    expect(ev[0]!.payload).toMatchObject({ cantidad: -10, valor: 150000, motivo: "grande" });
  });

  it("bodeguero puede ajustar; vendedor y contador no", async () => {
    const p = await producto(db, ctx.orgId);
    await comoUsuario(db, bodegueroId, () =>
      db.query("select ajustar_inventario($1,$2,$3,4,'recepción sin factura')", [
        ctx.orgId,
        p,
        ctx.bodegaId,
      ]),
    );
    for (const quien of [vendedorId, contadorId]) {
      const msg = await comoUsuario(db, quien, () =>
        mensajeDeError(() =>
          db.query("select ajustar_inventario($1,$2,$3,4,'x')", [ctx.orgId, p, ctx.bodegaId]),
        ),
      );
      expect(msg).toMatch(/Sin permiso/);
    }
    expect((await existencia(db, p, ctx.bodegaId)).cantidad).toBe(4);
  });
});

// ---------------------------------------------------------------------------------------------
// Propiedad: el trigger de SQL y el modelo de TypeScript (dinero.ts) coinciden, y el stock
// siempre es la suma firmada de los movimientos. 120 operaciones aleatorias reproducibles.
// ---------------------------------------------------------------------------------------------
function prng(semilla: number) {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("propiedad: kardex coherente tras operaciones aleatorias", () => {
  it.each([1, 2, 3])(
    "semilla %i: SQL == modelo TypeScript y stock == suma de movimientos",
    async (semilla) => {
      const azar = prng(semilla);
      const entero = (min: number, max: number) => Math.floor(azar() * (max - min + 1)) + min;
      const p = await producto(db, ctx.orgId, { precio: 20000 });

      let stock = new Decimal(0);
      let costo = new Decimal(0);
      const confirmadas: { id: string; cantidad: number; anulada: boolean }[] = [];

      for (let i = 0; i < 40; i++) {
        const op = azar();
        if (op < 0.3) {
          const q = entero(1, 20);
          const c = entero(10, 90) * 100;
          await compra(db, ctx, [{ producto: p, cantidad: q, costo: c }]);
          costo = costoPromedioPonderado(stock, costo, q, c);
          stock = stock.plus(q);
        } else if (op < 0.65) {
          const q = entero(1, 8);
          const id = await venta(db, ctx, [{ producto: p, cantidad: q, precio: 20000 }]);
          confirmadas.push({ id, cantidad: q, anulada: false });
          stock = stock.minus(q);
        } else if (op < 0.8) {
          const vivas = confirmadas.filter((v) => !v.anulada);
          if (vivas.length === 0) continue;
          const v = vivas[entero(0, vivas.length - 1)]!;
          await comoUsuario(db, ctx.usuarioId, () =>
            db.query("select anular_venta($1, 'prueba')", [v.id]),
          );
          v.anulada = true;
          stock = stock.plus(v.cantidad);
        } else {
          const q = entero(1, 5) * (azar() < 0.5 ? 1 : -1);
          await comoUsuario(db, ctx.usuarioId, () =>
            db.query("select ajustar_inventario($1,$2,$3,$4,'ajuste aleatorio')", [
              ctx.orgId,
              p,
              ctx.bodegaId,
              q,
            ]),
          );
          stock = stock.plus(q);
        }
        const real = await existencia(db, p, ctx.bodegaId);
        expect(real.cantidad, `stock tras la operación ${i}`).toBe(stock.toNumber());
        expect(real.costo, `costo tras la operación ${i}`).toBe(costo.toNumber());
      }

      // Invariante contable: existencias == Σ signo × cantidad de los movimientos
      const suma = await db.query<{ suma: string; saldo: string }>(
        `select sum(signo_movimiento(tipo) * cantidad)::text as suma,
              (select saldo_cantidad::text from movimientos_inventario where producto_id = $1 order by id desc limit 1) as saldo
         from movimientos_inventario where producto_id = $1`,
        [p],
      );
      expect(Number(suma.rows[0]!.suma)).toBe(stock.toNumber());
      expect(Number(suma.rows[0]!.saldo)).toBe(stock.toNumber());
    },
  );
});
