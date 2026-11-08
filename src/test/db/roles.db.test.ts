/**
 * Migración 0003: roles en escritura, plantillas de nicho, invitaciones, protección de dueños
 * y anulación de compras.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Bd,
  agregarMiembro,
  comoUsuario,
  crearBd,
  crearNegocio,
  crearUsuario,
  mensajeDeError,
} from "./bd";
import {
  type Ctx,
  cliente,
  compra,
  eventos,
  existencia,
  producto,
  proveedor,
  venta,
} from "./fabrica";

let db: Bd;
let ctx: Ctx;
let admin: string;
let vendedor: string;
let bodeguero: string;
let contador: string;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Ferretería Roles", "roles@x.co", "ferreteria");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  admin = await agregarMiembro(db, n.orgId, "admin@r.co", "admin");
  vendedor = await agregarMiembro(db, n.orgId, "vend@r.co", "vendedor");
  bodeguero = await agregarMiembro(db, n.orgId, "bod@r.co", "bodeguero");
  contador = await agregarMiembro(db, n.orgId, "cont@r.co", "contador");
  // Estas pruebas invitan a varias personas: con el plan sin tope de usuarios, el límite no estorba (se prueba en suscripcion.db.test.ts).
  await db.query("update suscripciones set plan = 'crecimiento' where organizacion_id = $1", [n.orgId]);
});

afterAll(async () => {
  await db.close();
});

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);

describe("escritura por rol", () => {
  it("el contador es de solo lectura: no puede crear nada", async () => {
    const intentos = [
      `insert into productos (organizacion_id, nombre) values ('${ctx.orgId}', 'X')`,
      `insert into clientes (organizacion_id, nombre) values ('${ctx.orgId}', 'X')`,
      `insert into proveedores (organizacion_id, nombre) values ('${ctx.orgId}', 'X')`,
      `insert into ventas (organizacion_id, bodega_id) values ('${ctx.orgId}', '${ctx.bodegaId}')`,
      `insert into compras (organizacion_id, bodega_id) values ('${ctx.orgId}', '${ctx.bodegaId}')`,
      `insert into categorias (organizacion_id, nombre) values ('${ctx.orgId}', 'X')`,
    ];
    for (const sql of intentos) {
      expect(await como(contador, () => mensajeDeError(() => db.query(sql))), sql).toMatch(
        /row-level security/i,
      );
    }
    // pero sí lee
    await como(contador, async () => {
      const r = await db.query("select count(*) from productos");
      expect(r.rows).toHaveLength(1);
    });
  });

  it("el vendedor vende y crea clientes pero no toca el catálogo ni las compras", async () => {
    await como(vendedor, () =>
      db.query("insert into clientes (organizacion_id, nombre) values ($1, 'Cliente nuevo')", [
        ctx.orgId,
      ]),
    );
    const p = await producto(db, ctx.orgId);
    for (const sql of [
      `insert into productos (organizacion_id, nombre) values ('${ctx.orgId}', 'X')`,
      `insert into proveedores (organizacion_id, nombre) values ('${ctx.orgId}', 'X')`,
      `insert into compras (organizacion_id, bodega_id) values ('${ctx.orgId}', '${ctx.bodegaId}')`,
    ]) {
      expect(await como(vendedor, () => mensajeDeError(() => db.query(sql)))).toMatch(
        /row-level security/i,
      );
    }
    // no puede cambiar el precio de un producto
    const u = await como(vendedor, () =>
      db.query("update productos set precio_venta = 1 where id = $1", [p]),
    );
    expect(u.affectedRows).toBe(0);
  });

  it("el bodeguero maneja catálogo y compras pero no vende", async () => {
    await como(bodeguero, () =>
      db.query("insert into productos (organizacion_id, nombre) values ($1, 'Desde bodega')", [
        ctx.orgId,
      ]),
    );
    expect(
      await como(bodeguero, () =>
        mensajeDeError(() =>
          db.query("insert into ventas (organizacion_id, bodega_id) values ($1, $2)", [
            ctx.orgId,
            ctx.bodegaId,
          ]),
        ),
      ),
    ).toMatch(/row-level security/i);
  });

  it("un turno solo se abre a nombre propio", async () => {
    const otro = await como(vendedor, () =>
      mensajeDeError(() =>
        db.query(
          "insert into turnos_caja (organizacion_id, bodega_id, usuario_id) values ($1,$2,$3)",
          [ctx.orgId, ctx.bodegaId, admin],
        ),
      ),
    );
    expect(otro).toMatch(/row-level security/i);
  });

  it("el vendedor no puede alterar un turno directamente (solo con cerrar_turno)", async () => {
    const t = await db.query<{ id: string }>(
      "insert into turnos_caja (organizacion_id, bodega_id, usuario_id) values ($1,$2,$3) returning id",
      [ctx.orgId, ctx.bodegaId, vendedor],
    );
    const u = await como(vendedor, () =>
      db.query("update turnos_caja set efectivo_esperado = 0, diferencia = 0 where id = $1", [
        t.rows[0]!.id,
      ]),
    );
    expect(u.affectedRows).toBe(0);
  });

  it("se pueden borrar líneas y borradores, nunca documentos confirmados", async () => {
    const p = await producto(db, ctx.orgId);
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 100 }]);
    const borrador = await venta(
      db,
      { ...ctx, usuarioId: vendedor },
      [{ producto: p, cantidad: 1, precio: 200 }],
      {
        confirmar: false,
      },
    );
    await como(vendedor, async () => {
      const d1 = await db.query("delete from pagos_venta where venta_id = $1", [borrador]);
      const d2 = await db.query("delete from ventas_detalle where venta_id = $1", [borrador]);
      const d3 = await db.query("delete from ventas where id = $1", [borrador]);
      expect([d1.affectedRows, d2.affectedRows, d3.affectedRows]).toEqual([1, 1, 1]);
    });
    const confirmada = await venta(db, { ...ctx, usuarioId: vendedor }, [
      { producto: p, cantidad: 1, precio: 200 },
    ]);
    const d = await como(vendedor, () =>
      db.query("delete from ventas where id = $1", [confirmada]),
    );
    expect(d.affectedRows).toBe(0);
  });

  it("registrar_abono: exige rol, no excede la deuda y deja auditoría", async () => {
    const p = await producto(db, ctx.orgId);
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 100 }]);
    const c = await cliente(db, ctx.orgId, { cupo: 100000 });
    await venta(db, { ...ctx, usuarioId: vendedor }, [{ producto: p, cantidad: 2, precio: 5000 }], {
      cliente: c,
      pagos: [{ metodo: "credito", monto: 10000 }],
    });
    expect(
      await como(contador, () =>
        mensajeDeError(() => db.query("select registrar_abono($1, 1000, 'efectivo')", [c])),
      ),
    ).toMatch(/Sin permiso/);
    expect(
      await como(vendedor, () =>
        mensajeDeError(() => db.query("select registrar_abono($1, 10001, 'efectivo')", [c])),
      ),
    ).toMatch(/supera la deuda/);
    await como(vendedor, () => db.query("select registrar_abono($1, 10000, 'efectivo')", [c]));
    const r = await db.query<{ saldo: string }>("select saldo::text from clientes where id = $1", [
      c,
    ]);
    expect(r.rows[0]!.saldo).toBe("0.00");
    const a = await db.query(
      "select 1 from auditoria where tabla = 'clientes' and registro_id = $1 and accion = 'abono'",
      [c],
    );
    expect(a.rows).toHaveLength(1);
  });
});

describe("anular_compra", () => {
  it("revierte el inventario con movimientos contrarios, limpia precios del proveedor y audita", async () => {
    const p = await producto(db, ctx.orgId);
    const prov = await proveedor(db, ctx.orgId);
    await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 5000 }]);
    const c = await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 7000 }], {
      proveedor: prov,
    });
    expect(await existencia(db, p, ctx.bodegaId)).toEqual({ cantidad: 20, costo: 6000 });

    await como(admin, () => db.query("select anular_compra($1, 'factura duplicada')", [c]));

    expect((await existencia(db, p, ctx.bodegaId)).cantidad).toBe(10);
    const tipos = await db.query<{ tipo: string }>(
      "select tipo from movimientos_inventario where documento_tipo = 'compra' and documento_id = $1 order by id",
      [c],
    );
    expect(tipos.rows.map((x) => x.tipo)).toEqual(["compra", "anulacion_salida"]);
    const precios = await db.query("select 1 from precios_proveedor where compra_id = $1", [c]);
    expect(precios.rows).toHaveLength(0);
    const est = await db.query<{ estado: string; motivo_anulacion: string }>(
      "select estado, motivo_anulacion from compras where id = $1",
      [c],
    );
    expect(est.rows[0]).toEqual({ estado: "anulado", motivo_anulacion: "factura duplicada" });
    expect(
      (await eventos(db, ctx.orgId, "compra.anulada")).some((e) => e.payload.compra_id === c),
    ).toBe(true);
    const aud = await db.query(
      "select 1 from auditoria where tabla = 'compras' and registro_id = $1 and accion = 'anular'",
      [c],
    );
    expect(aud.rows).toHaveLength(1);
  });

  it("exige motivo, rol dueño/admin y estado confirmado; no se anula dos veces", async () => {
    const p = await producto(db, ctx.orgId);
    const c = await compra(db, ctx, [{ producto: p, cantidad: 3, costo: 100 }]);
    const borrador = await compra(db, ctx, [{ producto: p, cantidad: 3, costo: 100 }], {
      confirmar: false,
    });
    expect(
      await como(admin, () => mensajeDeError(() => db.query("select anular_compra($1, ' ')", [c]))),
    ).toMatch(/motivo/);
    for (const u of [bodeguero, vendedor, contador]) {
      expect(
        await como(u, () => mensajeDeError(() => db.query("select anular_compra($1, 'x')", [c]))),
      ).toMatch(/Solo dueño o admin/);
    }
    expect(
      await como(admin, () =>
        mensajeDeError(() => db.query("select anular_compra($1, 'x')", [borrador])),
      ),
    ).toMatch(/confirmadas/);
    await como(admin, () => db.query("select anular_compra($1, 'x')", [c]));
    expect(
      await como(admin, () => mensajeDeError(() => db.query("select anular_compra($1, 'x')", [c]))),
    ).toMatch(/confirmadas/);
    expect((await existencia(db, p, ctx.bodegaId)).cantidad).toBe(0);
  });
});

describe("plantillas por nicho", () => {
  it.each([
    ["ferreteria", "Plomería"],
    ["ropa", "Calzado"],
    ["viveres", "Lácteos y huevos"],
    ["veterinaria", "Vacunas"],
    ["general", "General"],
  ])("crear_organizacion con nicho %s carga sus categorías", async (nicho, esperada) => {
    const n = await crearNegocio(db, `Negocio ${nicho}`, `${nicho}@plantilla.co`, nicho);
    const r = await db.query<{ nombre: string }>(
      "select nombre from categorias where organizacion_id = $1",
      [n.orgId],
    );
    expect(r.rows.map((x) => x.nombre)).toContain(esperada);
    expect(r.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("valida nombre y nicho, y deja auditoría de creación", async () => {
    const u = await crearUsuario(db, "valida@plantilla.co");
    await como(u, async () => {
      expect(
        await mensajeDeError(() => db.query("select crear_organizacion('  ', 'ferreteria', 'Yo')")),
      ).toMatch(/obligatorio/);
      expect(
        await mensajeDeError(() =>
          db.query("select crear_organizacion('Tienda', 'astronautas', 'Yo')"),
        ),
      ).toMatch(/Nicho inválido/);
    });
    const n = await crearNegocio(db, "Con auditoría", "aud@plantilla.co");
    const a = await db.query(
      "select 1 from auditoria where organizacion_id = $1 and accion = 'crear'",
      [n.orgId],
    );
    expect(a.rows).toHaveLength(1);
  });
});

describe("invitaciones", () => {
  const invitar = (quien: string, correo: string, rol: string) =>
    como(quien, async () => {
      const r = await db.query<{ token: string }>(
        "insert into invitaciones (organizacion_id, correo, rol, creado_por) values ($1, $2, $3::rol_miembro, $4) returning token",
        [ctx.orgId, correo, rol, quien],
      );
      return r.rows[0]!.token;
    });

  it("dueño y admin invitan; vendedor y contador no; nadie invita dueños", async () => {
    await invitar(ctx.usuarioId, "nuevo1@i.co", "vendedor");
    await invitar(admin, "nuevo2@i.co", "bodeguero");
    expect(await mensajeDeError(() => invitar(vendedor, "x@i.co", "vendedor"))).toMatch(
      /row-level security/i,
    );
    expect(await mensajeDeError(() => invitar(contador, "x@i.co", "vendedor"))).toMatch(
      /row-level security/i,
    );
    expect(await mensajeDeError(() => invitar(ctx.usuarioId, "x@i.co", "dueno"))).toMatch(
      /check|violates/i,
    );
  });

  it("solo dueño/admin ven los tokens", async () => {
    await como(vendedor, async () => {
      const r = await db.query("select * from invitaciones");
      expect(r.rows).toHaveLength(0);
    });
  });

  it("se acepta con el correo correcto y deja al usuario con el rol invitado", async () => {
    const token = await invitar(ctx.usuarioId, "ana@i.co", "vendedor");
    const ana = await crearUsuario(db, "Ana@I.co");
    const org = await como(ana, async () => {
      const r = await db.query<{ aceptar_invitacion: string }>(
        "select aceptar_invitacion($1, 'Ana Pérez')",
        [token],
      );
      return r.rows[0]!.aceptar_invitacion;
    });
    expect(org).toBe(ctx.orgId);
    const m = await db.query<{ rol: string; nombre: string }>(
      "select rol, nombre from miembros where usuario_id = $1 and organizacion_id = $2",
      [ana, ctx.orgId],
    );
    expect(m.rows).toEqual([{ rol: "vendedor", nombre: "Ana Pérez" }]);
    // y ya ve los productos del negocio
    await como(ana, async () => {
      expect(
        Number((await db.query<{ n: string }>("select count(*) as n from categorias")).rows[0]!.n),
      ).toBeGreaterThan(0);
    });
  });

  it("no sirve para otro correo, ni vencida, ni usada dos veces, ni inventada", async () => {
    const token = await invitar(ctx.usuarioId, "beto@i.co", "vendedor");
    const intruso = await crearUsuario(db, "intruso@i.co");
    expect(
      await como(intruso, () =>
        mensajeDeError(() => db.query("select aceptar_invitacion($1)", [token])),
      ),
    ).toMatch(/otro correo/);
    expect(
      await como(intruso, () =>
        mensajeDeError(() => db.query("select aceptar_invitacion('inventado')")),
      ),
    ).toMatch(/no válida/);
    const beto = await crearUsuario(db, "beto@i.co");
    await como(beto, () => db.query("select aceptar_invitacion($1)", [token]));
    expect(
      await como(beto, () =>
        mensajeDeError(() => db.query("select aceptar_invitacion($1)", [token])),
      ),
    ).toMatch(/ya fue usada/);

    const vencida = await invitar(ctx.usuarioId, "carla@i.co", "vendedor");
    await db.query(
      "update invitaciones set expira_en = now() - interval '1 day' where token = $1",
      [vencida],
    );
    const carla = await crearUsuario(db, "carla@i.co");
    expect(
      await como(carla, () =>
        mensajeDeError(() => db.query("select aceptar_invitacion($1)", [vencida])),
      ),
    ).toMatch(/venció/);
  });
});

describe("protección de dueños", () => {
  it("un admin no puede ascenderse a dueño ni tocar al dueño", async () => {
    expect(
      await como(admin, () =>
        mensajeDeError(() =>
          db.query("update miembros set rol = 'dueno' where usuario_id = $1", [admin]),
        ),
      ),
    ).toMatch(/Solo un dueño/);
    expect(
      await como(admin, () =>
        mensajeDeError(() =>
          db.query("update miembros set activo = false where usuario_id = $1", [ctx.usuarioId]),
        ),
      ),
    ).toMatch(/Solo un dueño/);
  });

  it("el admin sí cambia roles de los demás", async () => {
    await como(admin, () =>
      db.query("update miembros set rol = 'bodeguero' where usuario_id = $1", [vendedor]),
    );
    await db.query("update miembros set rol = 'vendedor' where usuario_id = $1", [vendedor]);
  });

  it("nunca queda un negocio sin dueño activo", async () => {
    const n = await crearNegocio(db, "Un solo dueño", "solo@dueno.co");
    expect(
      await como(n.duenoId, () =>
        mensajeDeError(() =>
          db.query("update miembros set activo = false where usuario_id = $1", [n.duenoId]),
        ),
      ),
    ).toMatch(/al menos un dueño/);
    expect(
      await como(n.duenoId, () =>
        mensajeDeError(() => db.query("delete from miembros where usuario_id = $1", [n.duenoId])),
      ),
    ).toMatch(/al menos un dueño/);
    // con un segundo dueño, el primero puede salir
    const segundo = await crearUsuario(db, "segundo@dueno.co");
    await como(n.duenoId, () =>
      db.query(
        "insert into miembros (organizacion_id, usuario_id, rol, nombre) values ($1,$2,'dueno','Segundo')",
        [n.orgId, segundo],
      ),
    );
    await como(n.duenoId, () =>
      db.query("update miembros set activo = false where usuario_id = $1", [n.duenoId]),
    );
  });
});

describe("la tabla de permisos de la interfaz coincide con la base de datos", () => {
  it("ESCRITURA (src/lib/permisos.ts) == roles_escritura(tabla)", async () => {
    const { ESCRITURA } = await import("@/lib/permisos");
    for (const [tabla, roles] of Object.entries(ESCRITURA)) {
      const r = await db.query<{ roles: string[] }>("select roles_escritura($1)::text[] as roles", [
        tabla,
      ]);
      expect([...r.rows[0]!.roles].sort(), tabla).toEqual([...roles].sort());
    }
  });
});
