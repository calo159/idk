/**
 * Aislamiento multi-tenant (CLAUDE.md regla #2): un usuario del negocio A no puede leer ni escribir
 * nada del negocio B, en NINGUNA tabla.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Bd,
  agregarMiembro,
  comoAnonimo,
  comoUsuario,
  crearBd,
  crearNegocio,
  crearUsuario,
  mensajeDeError,
} from "./bd";
import {
  abrirTurno,
  cliente,
  compra,
  comprobante,
  producto,
  proveedor,
  presentacion,
  venta,
} from "./fabrica";

interface Negocio {
  orgId: string;
  duenoId: string;
  bodegaId: string;
  productoId: string;
  clienteId: string;
  proveedorId: string;
  ventaId: string;
  compraId: string;
  vendedorId: string;
}

let db: Bd;
let A: Negocio;
let B: Negocio;
let tablasConOrg: string[];

async function sembrar(nombre: string, correo: string): Promise<Negocio> {
  const base = await crearNegocio(db, nombre, `dueno@${correo}`);
  const vendedorId = await agregarMiembro(db, base.orgId, `vendedor@${correo}`, "vendedor");
  const ctx = { orgId: base.orgId, usuarioId: base.duenoId, bodegaId: base.bodegaId };

  const productoId = await producto(db, base.orgId, {
    nombre: `Martillo ${nombre}`,
    precio: 25000,
    minimo: 2,
  });
  await presentacion(db, base.orgId, productoId, "Caja x12", 12, 270000);
  await db.query("insert into categorias (organizacion_id, nombre) values ($1, 'Herramientas')", [
    base.orgId,
  ]);
  const proveedorId = await proveedor(db, base.orgId);
  const clienteId = await cliente(db, base.orgId, { cupo: 500000 });
  const compraId = await compra(db, ctx, [{ producto: productoId, cantidad: 10, costo: 15000 }], {
    proveedor: proveedorId,
  });
  const turno = await abrirTurno(db, ctx, 50000);
  const comp = await comprobante(db, base.orgId, {
    hash: `h-${nombre}`,
    referencia: `ref-${nombre}`,
    monto: 25000,
  });
  const ventaId = await venta(db, ctx, [{ producto: productoId, cantidad: 1, precio: 25000 }], {
    turno,
    cliente: clienteId,
    pagos: [
      { metodo: "nequi", monto: 24000, comprobante: comp },
      { metodo: "credito", monto: 1000 },
    ],
  });
  await comoUsuario(db, base.duenoId, async () => {
    await db.query("select registrar_abono($1, $2, 'efectivo', $3)", [clienteId, 1000, turno]);
  });
  await comoUsuario(db, base.duenoId, async () => {
    await db.query("select registrar_gasto($1,'Transporte','Flete',1000,'efectivo',null,null,$2)", [base.orgId, turno]);
    await db.query("select registrar_movimiento_caja($1,'ingreso',500,'Cambio de la casa')", [turno]);
  });
  await db.query("insert into recordatorios_cobro (organizacion_id, cliente_id, nivel, saldo) values ($1,$2,1,1000)", [base.orgId, clienteId]);
  // Lista de precios, lote y serial (migración 0019)
  await comoUsuario(db, base.duenoId, async () => {
    const lista = (await db.query<{ id: string }>("select crear_lista_precios($1,'Mayorista') id", [base.orgId])).rows[0]!.id;
    await db.query("select fijar_precio_lista($1,$2,20000)", [lista, productoId]);
    await db.query("select registrar_lote($1,$2,$3,'L-1',current_date + 30,5)", [base.orgId, productoId, base.bodegaId]);
    await db.query("select registrar_seriales($1,$2,$3,$4::text[])", [base.orgId, productoId, base.bodegaId, ["SERIAL-RLS-" + correo]]);
  });
  // Deuda anterior del cuaderno (migración 0018)
  await comoUsuario(db, base.duenoId, async () => {
    await db.query("select registrar_deuda_inicial($1, 1000, 'Cuaderno')", [clienteId]);
  });
  // Metas y comisiones (migración 0017)
  await comoUsuario(db, base.duenoId, async () => {
    await db.query("select fijar_meta($1,$2,current_date,1000000)", [base.orgId, vendedorId]);
    await db.query("select fijar_comision($1,null,'ventas',2,1)", [base.orgId]);
  });
  // Cotización, separado con abono y devolución de cliente (migración 0016)
  await comoUsuario(db, base.duenoId, async () => {
    const lineas = JSON.stringify([{ producto_id: productoId, cantidad: 1, precio: 25000 }]);
    await db.query("select crear_cotizacion($1,$2,$3::jsonb)", [base.orgId, clienteId, lineas]);
    await db.query("select crear_separado($1,$2,$3,$4::jsonb,null,null,5000,'nequi')", [base.orgId, clienteId, base.bodegaId, lineas]);
    const det = (await db.query<{ id: string }>("select id from ventas_detalle where venta_id=$1 limit 1", [ventaId])).rows[0]!.id;
    await db.query("select registrar_devolucion_cliente($1,$2::jsonb,'Prueba','nequi')", [ventaId, JSON.stringify([{ venta_detalle_id: det, cantidad: 1 }])]);
  });
  await db.query("insert into pedidos_whatsapp (organizacion_id, mensaje_id, telefono, texto) values ($1, $2, '3112223344', 'dos de cemento')", [base.orgId, "wamid." + correo]);
  await comoUsuario(db, base.duenoId, async () => {
    await db.query("select guardar_ruta($1,$2,1,$3::uuid[])", [base.orgId, base.duenoId, [clienteId]]);
    await db.query("select registrar_visita($1,$2,'pedido','Prueba',11.5,-72.9,10,$3,null)", [base.orgId, clienteId, crypto.randomUUID()]);
  });
  await comoUsuario(db, base.duenoId, async () => {
    await db.query("select metricas_salud($1)", [base.orgId]);
  });
  await comoUsuario(db, base.duenoId, async () => {
    await db.query("select * from iniciar_pago_suscripcion($1,'negocio',1)", [base.orgId]);
  });
  await db.query("update organizaciones set fidelizacion_activa=true where id=$1", [base.orgId]);
  await db.query("insert into puntos_movimientos (organizacion_id, cliente_id, puntos, motivo) values ($1,$2,5,'cumpleanos')", [base.orgId, clienteId]);
  await db.query("insert into contactos_fidelizacion (organizacion_id, cliente_id, tipo) values ($1,$2,'cumpleanos')", [base.orgId, clienteId]);
  await db.query("insert into temporadas (organizacion_id, nombre, mes_inicio, dia_inicio, mes_fin, dia_fin, factor) values ($1,'Navidad',12,1,1,6,1.5)", [base.orgId]);
  await comoUsuario(db, base.duenoId, async () => {
    await db.query("select aplicar_precios($1,$2::jsonb)", [base.orgId, JSON.stringify([{ producto_id: productoId, precio: 26000 }])]);
  });
  await comoUsuario(db, base.duenoId, async () => {
    await db.query("select crear_promocion($1,'Liquidación',current_date,current_date + 7,$2::jsonb)", [base.orgId, JSON.stringify([{ producto_id: productoId, precio: 24000 }])]);
  });
  // Orden de compra recibida a crédito, pago al proveedor y devolución (migración 0014)
  await comoUsuario(db, base.duenoId, async () => {
    const oc = (
      await db.query<{ id: string }>("select crear_orden_compra($1,$2,$3,$4::jsonb) id", [
        base.orgId, proveedorId, base.bodegaId, JSON.stringify([{ producto_id: productoId, cantidad: 10, costo: 1000 }]),
      ])
    ).rows[0]!.id;
    const det = (await db.query<{ id: string }>("select id from ordenes_compra_detalle where orden_id=$1", [oc])).rows[0]!.id;
    const compraCredito = (
      await db.query<{ c: string }>("select recibir_orden_compra($1,$2::jsonb,null,'credito') c", [oc, JSON.stringify([{ detalle_id: det, cantidad: 10 }])])
    ).rows[0]!.c;
    const cxp = (await db.query<{ id: string }>("select id from cuentas_por_pagar where compra_id=$1", [compraCredito])).rows[0]!.id;
    await db.query("select registrar_pago_proveedor($1, 1000, 'efectivo')", [cxp]);
    await db.query("select registrar_devolucion_proveedor($1,$2,$3,$4::jsonb,'Dañado')", [
      base.orgId, proveedorId, base.bodegaId, JSON.stringify([{ producto_id: productoId, cantidad: 1 }]),
    ]);
  });
  // Traslado entre bodegas y conteo físico (migración 0013)
  const bodega2 = (
    await db.query<{ id: string }>("insert into bodegas (organizacion_id, nombre) values ($1, 'Depósito') returning id", [base.orgId])
  ).rows[0]!.id;
  await comoUsuario(db, base.duenoId, async () => {
    await db.query("select trasladar_inventario($1,$2,$3,$4::jsonb)", [
      base.orgId, base.bodegaId, bodega2, JSON.stringify([{ producto_id: productoId, cantidad: 1 }]),
    ]);
    await db.query("select iniciar_conteo($1,$2,'Conteo de prueba')", [base.orgId, base.bodegaId]);
  });
  // Baja el stock hasta el mínimo para que se dispare el evento stock.bajo (llena eventos_outbox).
  await comoUsuario(db, base.duenoId, async () => {
    await db.query("select ajustar_inventario($1, $2, $3, -7, 'conteo de prueba')", [
      base.orgId,
      productoId,
      base.bodegaId,
    ]);
  });
  await db.query(
    "insert into documentos_ia (organizacion_id, tipo, resultado) values ($1, 'factura', '{}')",
    [base.orgId],
  );
  await db.query(
    "insert into invitaciones (organizacion_id, correo, rol) values ($1, 'nuevo@' || $2, 'vendedor')",
    [base.orgId, correo],
  );
  await db.query("insert into eventos_outbox (organizacion_id, tipo) values ($1, 'prueba.sembrado')", [base.orgId]);
  await db.query(
    "insert into alertas (organizacion_id, tipo, mensaje) values ($1, 'prueba', 'hola')",
    [base.orgId],
  );
  return { ...base, productoId, clienteId, proveedorId, ventaId, compraId, vendedorId };
}

beforeAll(async () => {
  db = await crearBd();
  A = await sembrar("Ferretería A", "a.co");
  B = await sembrar("Ferretería B", "b.co");
  const r = await db.query<{ tabla: string }>(`
    select c.relname as tabla from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('organizaciones', 'planes') -- planes: catálogo global de precios
    order by 1`);
  // Las tablas internas del bot no tienen política de lectura a propósito (solo el service role las usa).
  tablasConOrg = r.rows.map((x) => x.tabla).filter((t) => !t.startsWith("bot_"));
});

afterAll(async () => {
  await db.close();
});

const contar = async (sql: string, params: unknown[] = []) =>
  Number((await db.query<{ n: string }>(sql, params)).rows[0]!.n);

describe("lectura: cada negocio solo ve lo suyo", () => {
  it("control positivo: el dueño de A ve filas propias en todas las tablas sembradas", async () => {
    const vacias: string[] = [];
    await comoUsuario(db, A.duenoId, async () => {
      for (const t of tablasConOrg) {
        const n = await contar(`select count(*) as n from ${t} where organizacion_id = $1`, [
          A.orgId,
        ]);
        if (n === 0) vacias.push(t);
      }
    });
    // Si alguna tabla queda vacía, el test de aislamiento no probaría nada en ella.
    expect(vacias).toEqual([]);
  });

  it.each(["dueno", "vendedor"] as const)(
    "el %s de B no ve NINGUNA fila de A en ninguna tabla",
    async (rol) => {
      const usuario = rol === "dueno" ? B.duenoId : B.vendedorId;
      const fugas: Record<string, number> = {};
      await comoUsuario(db, usuario, async () => {
        for (const t of tablasConOrg) {
          const n = await contar(`select count(*) as n from ${t} where organizacion_id <> $1`, [
            B.orgId,
          ]);
          if (n > 0) fugas[t] = n;
        }
        const orgs = await contar("select count(*) as n from organizaciones where id <> $1", [
          B.orgId,
        ]);
        if (orgs > 0) fugas["organizaciones"] = orgs;
      });
      expect(fugas).toEqual({});
    },
  );

  it("consultar por id exacto un registro de A devuelve vacío para B", async () => {
    await comoUsuario(db, B.duenoId, async () => {
      for (const [tabla, id] of [
        ["productos", A.productoId],
        ["clientes", A.clienteId],
        ["proveedores", A.proveedorId],
        ["ventas", A.ventaId],
        ["compras", A.compraId],
      ] as const) {
        const r = await db.query(`select * from ${tabla} where id = $1`, [id]);
        expect(r.rows, tabla).toHaveLength(0);
      }
    });
  });

  it("las vistas respetan RLS (security_invoker)", async () => {
    await comoUsuario(db, B.duenoId, async () => {
      expect(
        await contar("select count(*) as n from v_ventas_dia where organizacion_id = $1", [
          A.orgId,
        ]),
      ).toBe(0);
      expect(
        await contar("select count(*) as n from v_plata_dormida where organizacion_id = $1", [
          A.orgId,
        ]),
      ).toBe(0);
      expect(
        await contar("select count(*) as n from v_ventas_dia where organizacion_id = $1", [
          B.orgId,
        ]),
      ).toBe(1);
    });
  });

  it("un visitante sin sesión no ve nada", async () => {
    const fugas: string[] = [];
    await comoAnonimo(db, async () => {
      for (const t of [...tablasConOrg, "organizaciones"]) {
        if ((await contar(`select count(*) as n from ${t}`)) > 0) fugas.push(t);
      }
    });
    expect(fugas).toEqual([]);
  });

  it("un usuario sin negocio no ve nada", async () => {
    const huerfano = await crearUsuario(db, "huerfano@x.co");
    const fugas: string[] = [];
    await comoUsuario(db, huerfano, async () => {
      for (const t of [...tablasConOrg, "organizaciones"]) {
        if ((await contar(`select count(*) as n from ${t}`)) > 0) fugas.push(t);
      }
    });
    expect(fugas).toEqual([]);
  });

  it("un miembro desactivado pierde el acceso a su negocio", async () => {
    const ex = await agregarMiembro(db, B.orgId, "ex@b.co", "vendedor");
    await comoUsuario(db, ex, async () => {
      expect(await contar("select count(*) as n from productos")).toBeGreaterThan(0);
    });
    await db.query("update miembros set activo = false where usuario_id = $1", [ex]);
    await comoUsuario(db, ex, async () => {
      expect(await contar("select count(*) as n from productos")).toBe(0);
    });
  });
});

describe("escritura: B no puede tocar datos de A", () => {
  it("no puede insertar filas con organizacion_id de A", async () => {
    await comoUsuario(db, B.duenoId, async () => {
      const casos: [string, unknown[]][] = [
        ["insert into productos (organizacion_id, nombre) values ($1, 'Intruso')", [A.orgId]],
        ["insert into clientes (organizacion_id, nombre) values ($1, 'Intruso')", [A.orgId]],
        ["insert into proveedores (organizacion_id, nombre) values ($1, 'Intruso')", [A.orgId]],
        ["insert into categorias (organizacion_id, nombre) values ($1, 'Intruso')", [A.orgId]],
        [
          "insert into alertas (organizacion_id, tipo, mensaje) values ($1, 'x', 'Intruso')",
          [A.orgId],
        ],
        [
          "insert into ventas (organizacion_id, bodega_id) select $1, id from bodegas limit 1",
          [A.orgId],
        ],
      ];
      for (const [sql, params] of casos) {
        const msg = await mensajeDeError(() => db.query(sql, params));
        expect(msg, sql).toMatch(/row-level security|Referencia inválida/i);
      }
    });
  });

  it("UPDATE y DELETE sobre filas de A no afectan nada", async () => {
    await comoUsuario(db, B.duenoId, async () => {
      const u = await db.query("update productos set nombre = 'HACKEADO' where id = $1", [
        A.productoId,
      ]);
      expect(u.affectedRows).toBe(0);
      const u2 = await db.query("update clientes set cupo_credito = 99999999 where id = $1", [
        A.clienteId,
      ]);
      expect(u2.affectedRows).toBe(0);
      const u3 = await db.query("update organizaciones set nombre = 'HACKEADO' where id = $1", [
        A.orgId,
      ]);
      expect(u3.affectedRows).toBe(0);
      const d = await db.query("delete from productos where id = $1", [A.productoId]);
      expect(d.affectedRows).toBe(0);
    });
    const r = await db.query<{ nombre: string }>("select nombre from productos where id = $1", [
      A.productoId,
    ]);
    expect(r.rows[0]!.nombre).toBe("Martillo Ferretería A");
  });

  it("no puede mover una fila propia al negocio de A (WITH CHECK implícito)", async () => {
    await comoUsuario(db, B.duenoId, async () => {
      const msg = await mensajeDeError(() =>
        db.query("update productos set organizacion_id = $1 where id = $2", [
          A.orgId,
          B.productoId,
        ]),
      );
      expect(msg).toMatch(/row-level security/i);
    });
  });

  it("no puede autoagregarse como miembro de A ni cambiar roles de A", async () => {
    await comoUsuario(db, B.duenoId, async () => {
      const msg = await mensajeDeError(() =>
        db.query(
          "insert into miembros (organizacion_id, usuario_id, rol, nombre) values ($1, $2, 'dueno', 'Intruso')",
          [A.orgId, B.duenoId],
        ),
      );
      expect(msg).toMatch(/row-level security|Solo un dueño/i);
      const u = await db.query("update miembros set rol = 'contador' where organizacion_id = $1", [
        A.orgId,
      ]);
      expect(u.affectedRows).toBe(0);
    });
    expect(
      await contar(
        "select count(*) as n from miembros where organizacion_id = $1 and usuario_id = $2",
        [A.orgId, B.duenoId],
      ),
    ).toBe(0);
  });

  it("los movimientos, existencias, auditoría y outbox no se escriben desde el cliente", async () => {
    await comoUsuario(db, A.duenoId, async () => {
      for (const sql of [
        `insert into movimientos_inventario (organizacion_id, producto_id, bodega_id, tipo, cantidad)
         values ('${A.orgId}', '${A.productoId}', '${A.bodegaId}', 'ajuste_entrada', 999)`,
        `insert into existencias (organizacion_id, producto_id, bodega_id, cantidad) values ('${A.orgId}', '${A.productoId}', '${A.bodegaId}', 999)`,
        `insert into auditoria (organizacion_id, tabla, registro_id, accion) values ('${A.orgId}', 'x', '1', 'x')`,
        `insert into eventos_outbox (organizacion_id, tipo) values ('${A.orgId}', 'falso')`,
        `insert into consecutivos (organizacion_id, documento, ultimo) values ('${A.orgId}', 'x', 1)`,
      ]) {
        expect(await mensajeDeError(() => db.query(sql)), sql).toMatch(/row-level security/i);
      }
      // y el UPDATE directo de existencias no cambia nada (no hay política de UPDATE)
      const u = await db.query("update existencias set cantidad = 99999 where producto_id = $1", [
        A.productoId,
      ]);
      expect(u.affectedRows).toBe(0);
    });
  });
});

describe("integridad entre negocios (referencias cruzadas)", () => {
  it("B no puede armar una venta propia con el producto, cliente o bodega de A", async () => {
    await comoUsuario(db, B.duenoId, async () => {
      const v = await db.query<{ id: string }>(
        "insert into ventas (organizacion_id, bodega_id, usuario_id) values ($1, $2, $3) returning id",
        [B.orgId, B.bodegaId, B.duenoId],
      );
      const msg = await mensajeDeError(() =>
        db.query(
          "insert into ventas_detalle (organizacion_id, venta_id, producto_id, cantidad, precio_unitario) values ($1, $2, $3, 1, 100)",
          [B.orgId, v.rows[0]!.id, A.productoId],
        ),
      );
      expect(msg, "detalle con producto de A").not.toBeNull();
      const msg2 = await mensajeDeError(() =>
        db.query(
          "insert into ventas (organizacion_id, bodega_id, cliente_id) values ($1, $2, $3)",
          [B.orgId, B.bodegaId, A.clienteId],
        ),
      );
      expect(msg2, "venta con cliente de A").not.toBeNull();
      const msg3 = await mensajeDeError(() =>
        db.query("insert into ventas (organizacion_id, bodega_id) values ($1, $2)", [
          B.orgId,
          A.bodegaId,
        ]),
      );
      expect(msg3, "venta con bodega de A").not.toBeNull();
    });
  });
});

describe("funciones de negocio: B no puede operar sobre documentos de A", () => {
  it("confirmar_compra / confirmar_venta / anular_venta ajenas fallan", async () => {
    const borradorA = await compra(
      db,
      { orgId: A.orgId, usuarioId: A.duenoId, bodegaId: A.bodegaId },
      [{ producto: A.productoId, cantidad: 1, costo: 1 }],
      { confirmar: false },
    );
    const ventaBorradorA = await venta(
      db,
      { orgId: A.orgId, usuarioId: A.duenoId, bodegaId: A.bodegaId },
      [{ producto: A.productoId, cantidad: 1, precio: 100 }],
      { confirmar: false },
    );
    await comoUsuario(db, B.duenoId, async () => {
      expect(
        await mensajeDeError(() => db.query("select confirmar_compra($1)", [borradorA])),
      ).toMatch(/Sin permiso/);
      expect(
        await mensajeDeError(() => db.query("select confirmar_venta($1)", [ventaBorradorA])),
      ).toMatch(/Sin permiso/);
      expect(
        await mensajeDeError(() => db.query("select anular_venta($1, 'robo')", [A.ventaId])),
      ).toMatch(/Solo dueño o admin/);
    });
    // nada cambió
    const r = await db.query<{ estado: string }>("select estado from ventas where id = $1", [
      A.ventaId,
    ]);
    expect(r.rows[0]!.estado).toBe("confirmado");
  });

  it("ajustar_inventario, registrar_abono, verificar_comprobante y cerrar_turno ajenos fallan", async () => {
    const compA = await db.query<{ id: string }>(
      "select id from comprobantes where organizacion_id = $1 limit 1",
      [A.orgId],
    );
    const turnoA = await db.query<{ id: string }>(
      "select id from turnos_caja where organizacion_id = $1 limit 1",
      [A.orgId],
    );
    await comoUsuario(db, B.duenoId, async () => {
      expect(
        await mensajeDeError(() =>
          db.query("select ajustar_inventario($1, $2, $3, -5, 'robo')", [
            A.orgId,
            A.productoId,
            A.bodegaId,
          ]),
        ),
      ).toMatch(/Sin permiso/);
      expect(
        await mensajeDeError(() =>
          db.query("select registrar_abono($1, 1000, 'efectivo')", [A.clienteId]),
        ),
      ).toMatch(/Cliente no existe/);
      expect(
        await mensajeDeError(() =>
          db.query("select verificar_comprobante($1, 25000)", [compA.rows[0]!.id]),
        ),
      ).toMatch(/Sin acceso/);
      expect(
        await mensajeDeError(() =>
          db.query("select cerrar_turno($1, 0, '{}')", [turnoA.rows[0]!.id]),
        ),
      ).toMatch(/Sin permiso/);
    });
  });

  it("mis_organizaciones() solo devuelve las del usuario", async () => {
    await comoUsuario(db, B.duenoId, async () => {
      const r = await db.query<{ mis_organizaciones: string }>("select mis_organizaciones()");
      expect(r.rows.map((x) => x.mis_organizaciones)).toEqual([B.orgId]);
    });
  });
});

describe("registro de negocio nuevo", () => {
  it("crear_organizacion exige sesión", async () => {
    expect(
      await mensajeDeError(() => db.query("select crear_organizacion('X','general','Y')")),
    ).toMatch(/iniciar sesión/);
  });

  it("el creador queda como dueño con bodega principal y sin acceso a otros negocios", async () => {
    const n = await crearNegocio(db, "Tienda Nueva", "nuevo@c.co", "viveres");
    await comoUsuario(db, n.duenoId, async () => {
      const m = await db.query<{ rol: string }>("select rol from miembros where usuario_id = $1", [
        n.duenoId,
      ]);
      expect(m.rows.map((x) => x.rol)).toEqual(["dueno"]);
      const b = await db.query<{ nombre: string; es_principal: boolean }>(
        "select nombre, es_principal from bodegas",
      );
      expect(b.rows).toEqual([{ nombre: "Principal", es_principal: true }]);
      expect(await contar("select count(*) as n from productos")).toBe(0);
    });
  });
});
