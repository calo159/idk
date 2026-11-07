/**
 * Verificación de comprobantes Nequi/Daviplata: repetidos y montos que no cuadran.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, comprobante, compra, eventos, producto, venta } from "./fabrica";

let db: Bd;
let dueno: Ctx;
let vendedor: Ctx;
let p: string;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Ferretería Pagos", "pagos@x.co");
  dueno = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = {
    ...dueno,
    usuarioId: await agregarMiembro(db, n.orgId, "vend@pagos.co", "vendedor"),
  };
  p = await producto(db, n.orgId, { precio: 25000 });
  await compra(db, dueno, [{ producto: p, cantidad: 100, costo: 10000 }]);
});

afterAll(async () => {
  await db.close();
});

const verificar = (quien: string, comp: string, monto: number) =>
  comoUsuario(db, quien, async () => {
    const r = await db.query<{ verificar_comprobante: string }>(
      "select verificar_comprobante($1, $2)",
      [comp, monto],
    );
    return r.rows[0]!.verificar_comprobante;
  });

describe("verificar_comprobante", () => {
  it("comprobante nuevo y monto correcto → verificado_ia", async () => {
    const c = await comprobante(db, dueno.orgId, {
      hash: "hash-ok",
      referencia: "M1001",
      monto: 25000,
    });
    expect(await verificar(vendedor.usuarioId, c, 25000)).toBe("verificado_ia");
  });

  it("monto distinto al del pago → sospechoso + evento con lo leído y lo esperado", async () => {
    const c = await comprobante(db, dueno.orgId, {
      hash: "hash-monto",
      referencia: "M1002",
      monto: 2500,
    });
    expect(await verificar(vendedor.usuarioId, c, 25000)).toBe("sospechoso");
    const ev = (await eventos(db, dueno.orgId, "comprobante.sospechoso")).find(
      (e) => e.payload.comprobante_id === c,
    );
    expect(ev?.payload).toMatchObject({ razon: "monto_diferente", leido: 2500, esperado: 25000 });
  });

  it("si la IA no pudo leer el monto → sospechoso", async () => {
    const c = await comprobante(db, dueno.orgId, {
      hash: "hash-null",
      referencia: "M1003",
      monto: null,
    });
    expect(await verificar(vendedor.usuarioId, c, 25000)).toBe("sospechoso");
  });

  it("la misma imagen (hash) usada dos veces → sospechoso 'repetido'", async () => {
    await comprobante(db, dueno.orgId, { hash: "hash-dup", referencia: "A-1", monto: 25000 });
    const segundo = await comprobante(db, dueno.orgId, {
      hash: "hash-dup",
      referencia: "A-2",
      monto: 25000,
    });
    expect(await verificar(vendedor.usuarioId, segundo, 25000)).toBe("sospechoso");
    const ev = (await eventos(db, dueno.orgId, "comprobante.sospechoso")).find(
      (e) => e.payload.comprobante_id === segundo,
    );
    expect(ev?.payload.razon).toBe("repetido");
  });

  it("la misma referencia con otra foto (recorte/captura) → sospechoso 'repetido'", async () => {
    await comprobante(db, dueno.orgId, { hash: "foto-1", referencia: "REF-777", monto: 25000 });
    const segundo = await comprobante(db, dueno.orgId, {
      hash: "foto-2",
      referencia: "REF-777",
      monto: 25000,
    });
    expect(await verificar(vendedor.usuarioId, segundo, 25000)).toBe("sospechoso");
  });

  it("verificar el mismo comprobante otra vez no lo marca como repetido de sí mismo", async () => {
    const c = await comprobante(db, dueno.orgId, {
      hash: "hash-self",
      referencia: "SELF-1",
      monto: 25000,
    });
    expect(await verificar(vendedor.usuarioId, c, 25000)).toBe("verificado_ia");
    expect(await verificar(vendedor.usuarioId, c, 25000)).toBe("verificado_ia");
  });

  it("la misma referencia en OTRO negocio no cuenta como repetida", async () => {
    const otro = await crearNegocio(db, "Otro negocio", "otro-pagos@x.co");
    await comprobante(db, otro.orgId, { hash: "cruzado", referencia: "REF-CRUZ", monto: 25000 });
    const mio = await comprobante(db, dueno.orgId, {
      hash: "cruzado",
      referencia: "REF-CRUZ",
      monto: 25000,
    });
    expect(await verificar(vendedor.usuarioId, mio, 25000)).toBe("verificado_ia");
  });
});

describe("estado de verificación del pago", () => {
  it("el sistema (función) marca el pago; el cliente no puede ponerlo ni cambiarlo", async () => {
    const comp = await comprobante(db, dueno.orgId, {
      hash: "h-pago",
      referencia: "P-1",
      monto: 25000,
    });
    const v = await venta(db, vendedor, [{ producto: p, cantidad: 1, precio: 25000 }], {
      pagos: [{ metodo: "nequi", monto: 25000, comprobante: comp }],
    });
    const pago = (
      await db.query<{ id: string }>("select id from pagos_venta where venta_id = $1", [v])
    ).rows[0]!.id;

    // directo desde el navegador: bloqueado (además la venta está confirmada)
    const directo = await comoUsuario(db, vendedor.usuarioId, () =>
      mensajeDeError(() =>
        db.query("update pagos_venta set verificacion = 'verificado_ia' where id = $1", [pago]),
      ),
    );
    expect(directo).not.toBeNull();

    // por la función, tras verificar el comprobante
    await comoUsuario(db, vendedor.usuarioId, () =>
      db.query("select marcar_verificacion_pago($1, 'verificado_ia')", [pago]),
    );
    const r = await db.query<{ verificacion: string }>(
      "select verificacion from pagos_venta where id = $1",
      [pago],
    );
    expect(r.rows[0]!.verificacion).toBe("verificado_ia");
  });

  it("solo dueño o admin pueden verificar manualmente", async () => {
    const v = await venta(db, vendedor, [{ producto: p, cantidad: 1, precio: 25000 }], {
      pagos: [{ metodo: "daviplata", monto: 25000 }],
    });
    const pago = (
      await db.query<{ id: string }>("select id from pagos_venta where venta_id = $1", [v])
    ).rows[0]!.id;
    const msg = await comoUsuario(db, vendedor.usuarioId, () =>
      mensajeDeError(() =>
        db.query("select marcar_verificacion_pago($1, 'verificado_manual')", [pago]),
      ),
    );
    expect(msg).toMatch(/Solo dueño o admin/);
    await comoUsuario(db, dueno.usuarioId, () =>
      db.query("select marcar_verificacion_pago($1, 'verificado_manual')", [pago]),
    );
    const r = await db.query<{ verificacion: string }>(
      "select verificacion from pagos_venta where id = $1",
      [pago],
    );
    expect(r.rows[0]!.verificacion).toBe("verificado_manual");
  });
});
