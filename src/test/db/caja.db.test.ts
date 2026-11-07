/**
 * Caja: turnos, efectivo esperado, arqueo y diferencia (el dinero de verdad del negocio).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, cliente, compra, eventos, producto, venta } from "./fabrica";

let db: Bd;
let dueno: Ctx;
let producto1: string;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Ferretería Caja", "caja@x.co");
  dueno = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  producto1 = await producto(db, n.orgId, { precio: 10000 });
  await compra(db, dueno, [{ producto: producto1, cantidad: 1000, costo: 6000 }]);
});

afterAll(async () => {
  await db.close();
});

async function nuevoVendedor(nombre: string): Promise<Ctx> {
  return {
    ...dueno,
    usuarioId: await agregarMiembro(db, dueno.orgId, `${nombre}@caja.co`, "vendedor"),
  };
}

const cerrar = (quien: string, turno: string, contado: number, denominaciones: object = {}) =>
  comoUsuario(db, quien, async () => {
    const r = await db.query<{ cerrar_turno: string }>("select cerrar_turno($1, $2, $3::jsonb)", [
      turno,
      contado,
      JSON.stringify(denominaciones),
    ]);
    return Number(r.rows[0]!.cerrar_turno);
  });

describe("efectivo esperado al cerrar", () => {
  it("base + ventas en efectivo + abonos en efectivo; ignora Nequi, crédito y ventas anuladas", async () => {
    const v = await nuevoVendedor("ana");
    const turno = await abrirTurno(db, v, 50000);
    const c = await cliente(db, dueno.orgId, { cupo: 500000 });

    await venta(db, v, [{ producto: producto1, cantidad: 3, precio: 10000 }], { turno }); // efectivo 30.000
    await venta(db, v, [{ producto: producto1, cantidad: 2, precio: 10000 }], {
      turno,
      pagos: [
        { metodo: "nequi", monto: 15000 },
        { metodo: "efectivo", monto: 5000 }, // mixto: solo 5.000 es efectivo
      ],
    });
    await venta(db, v, [{ producto: producto1, cantidad: 1, precio: 10000 }], {
      turno,
      cliente: c,
      pagos: [{ metodo: "credito", monto: 10000 }],
    });
    const anulada = await venta(db, v, [{ producto: producto1, cantidad: 1, precio: 10000 }], {
      turno,
    }); // 10.000, se anula
    await comoUsuario(db, dueno.usuarioId, () =>
      db.query("select anular_venta($1, 'devolución')", [anulada]),
    );
    await comoUsuario(db, v.usuarioId, () =>
      db.query("select registrar_abono($1, 4000, 'efectivo', $2)", [c, turno]),
    );
    await comoUsuario(db, v.usuarioId, () =>
      db.query("select registrar_abono($1, 6000, 'nequi', $2)", [c, turno]),
    ); // no es efectivo

    // 50.000 + 30.000 + 5.000 + 4.000 = 89.000
    const diferencia = await cerrar(v.usuarioId, turno, 88000, {
      "50000": 1,
      "20000": 1,
      "10000": 1,
      "5000": 1,
      "2000": 1,
      "1000": 1,
    });
    expect(diferencia).toBe(-1000); // faltante de $ 1.000

    const t = await db.query<{
      estado: string;
      efectivo_esperado: string;
      efectivo_contado: string;
      diferencia: string;
      conteo_denominaciones: Record<string, number>;
      cerrado_en: string | null;
    }>(
      "select estado, efectivo_esperado::text, efectivo_contado::text, diferencia::text, conteo_denominaciones, cerrado_en::text from turnos_caja where id = $1",
      [turno],
    );
    expect(t.rows[0]).toMatchObject({
      estado: "cerrado",
      efectivo_esperado: "89000.00",
      efectivo_contado: "88000.00",
      diferencia: "-1000.00",
    });
    expect(t.rows[0]!.conteo_denominaciones["50000"]).toBe(1);
    expect(t.rows[0]!.cerrado_en).not.toBeNull();
  });

  it("sobrante: contado mayor al esperado da diferencia positiva", async () => {
    const v = await nuevoVendedor("sobra");
    const turno = await abrirTurno(db, v, 20000);
    await venta(db, v, [{ producto: producto1, cantidad: 1, precio: 10000 }], { turno });
    expect(await cerrar(v.usuarioId, turno, 35000)).toBe(5000);
  });

  it("cuadre exacto da cero", async () => {
    const v = await nuevoVendedor("exacto");
    const turno = await abrirTurno(db, v, 0);
    await venta(db, v, [{ producto: producto1, cantidad: 2, precio: 10000 }], { turno });
    expect(await cerrar(v.usuarioId, turno, 20000)).toBe(0);
  });

  it("no mezcla ventas de otros turnos", async () => {
    const a = await nuevoVendedor("turnoA");
    const b = await nuevoVendedor("turnoB");
    const ta = await abrirTurno(db, a, 10000);
    const tb = await abrirTurno(db, b, 10000);
    await venta(db, a, [{ producto: producto1, cantidad: 1, precio: 10000 }], { turno: ta });
    await venta(db, b, [{ producto: producto1, cantidad: 5, precio: 10000 }], { turno: tb });
    expect(await cerrar(a.usuarioId, ta, 20000)).toBe(0); // 10.000 base + 10.000
    expect(await cerrar(b.usuarioId, tb, 60000)).toBe(0); // 10.000 base + 50.000
  });

  it("un turno sin ventas esperado = base", async () => {
    const v = await nuevoVendedor("vacio");
    const turno = await abrirTurno(db, v, 80000);
    expect(await cerrar(v.usuarioId, turno, 80000)).toBe(0);
  });
});

describe("reglas del turno", () => {
  it("un usuario solo puede tener un turno abierto a la vez", async () => {
    const v = await nuevoVendedor("doble");
    await abrirTurno(db, v, 0);
    expect(await mensajeDeError(() => abrirTurno(db, v, 0))).toMatch(
      /un_turno_abierto_por_usuario|duplicate key/,
    );
  });

  it("después de cerrar puede abrir otro", async () => {
    const v = await nuevoVendedor("reabre");
    const t1 = await abrirTurno(db, v, 0);
    await cerrar(v.usuarioId, t1, 0);
    await abrirTurno(db, v, 0);
  });

  it("un turno cerrado no se vuelve a cerrar", async () => {
    const v = await nuevoVendedor("cerrado");
    const t = await abrirTurno(db, v, 0);
    await cerrar(v.usuarioId, t, 0);
    expect(await mensajeDeError(() => cerrar(v.usuarioId, t, 999))).toMatch(/no está abierto/);
  });

  it("un vendedor no puede cerrar el turno de otro; el dueño sí", async () => {
    const a = await nuevoVendedor("duena");
    const intruso = await nuevoVendedor("intruso");
    const t = await abrirTurno(db, a, 1000);
    expect(await mensajeDeError(() => cerrar(intruso.usuarioId, t, 0))).toMatch(
      /Sin permiso para cerrar/,
    );
    expect(await cerrar(dueno.usuarioId, t, 1000)).toBe(0);
  });

  it("cerrar la caja emite el evento caja.cerrada con la diferencia", async () => {
    const v = await nuevoVendedor("evento");
    const t = await abrirTurno(db, v, 5000);
    await cerrar(v.usuarioId, t, 3000);
    const ev = (await eventos(db, dueno.orgId, "caja.cerrada")).find(
      (e) => e.payload.turno_id === t,
    );
    expect(ev?.payload).toMatchObject({ esperado: 5000, contado: 3000, diferencia: -2000 });
  });
});
