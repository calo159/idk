/**
 * Fábrica de datos para tests de base de datos. Todo se crea COMO EL USUARIO (RLS activa) y los
 * cambios de estado pasan por las funciones SQL reales (confirmar_compra, confirmar_venta…), igual
 * que la aplicación.
 */
import { type Bd, comoUsuario } from "./bd";

export interface Ctx {
  orgId: string;
  usuarioId: string;
  bodegaId: string;
}

let contador = 0;
const sig = () => ++contador;

export async function producto(
  db: Bd,
  orgId: string,
  o: {
    nombre?: string;
    precio?: number;
    minimo?: number;
    barras?: string;
    manejaInventario?: boolean;
    unidad?: string;
  } = {},
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into productos (organizacion_id, nombre, precio_venta, stock_minimo, codigo_barras,
                            maneja_inventario, unidad_base)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      orgId,
      o.nombre ?? `Producto ${sig()}`,
      o.precio ?? 10000,
      o.minimo ?? 0,
      o.barras ?? null,
      o.manejaInventario ?? true,
      o.unidad ?? "unidad",
    ],
  );
  return r.rows[0]!.id;
}

export async function presentacion(
  db: Bd,
  orgId: string,
  productoId: string,
  nombre: string,
  factor: number,
  precio: number,
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into presentaciones (organizacion_id, producto_id, nombre, factor, precio_venta)
     values ($1, $2, $3, $4, $5) returning id`,
    [orgId, productoId, nombre, factor, precio],
  );
  return r.rows[0]!.id;
}

export async function proveedor(
  db: Bd,
  orgId: string,
  nombre = "Distribuidora Caribe",
): Promise<string> {
  const r = await db.query<{ id: string }>(
    "insert into proveedores (organizacion_id, nombre) values ($1, $2) returning id",
    [orgId, nombre],
  );
  return r.rows[0]!.id;
}

export async function cliente(
  db: Bd,
  orgId: string,
  o: { nombre?: string; cupo?: number; telefono?: string } = {},
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into clientes (organizacion_id, nombre, cupo_credito, telefono)
     values ($1, $2, $3, $4) returning id`,
    [
      orgId,
      o.nombre ?? `Cliente ${sig()}`,
      o.cupo ?? 0,
      o.telefono ?? `300${String(1000000 + sig())}`,
    ],
  );
  return r.rows[0]!.id;
}

export interface LineaCompra {
  producto: string;
  cantidad: number;
  costo: number;
  presentacion?: string;
}

/** Crea una compra en borrador con su detalle y la confirma. Devuelve el id. */
export async function compra(
  db: Bd,
  ctx: Ctx,
  lineas: LineaCompra[],
  o: { proveedor?: string; confirmar?: boolean; fecha?: string } = {},
): Promise<string> {
  return comoUsuario(db, ctx.usuarioId, async () => {
    const c = await db.query<{ id: string }>(
      `insert into compras (organizacion_id, bodega_id, proveedor_id, usuario_id, fecha)
       values ($1, $2, $3, $4, coalesce($5::date, (now() at time zone 'America/Bogota')::date)) returning id`,
      [ctx.orgId, ctx.bodegaId, o.proveedor ?? null, ctx.usuarioId, o.fecha ?? null],
    );
    const id = c.rows[0]!.id;
    for (const l of lineas) {
      await db.query(
        `insert into compras_detalle (organizacion_id, compra_id, producto_id, presentacion_id, cantidad, costo_unitario)
         values ($1, $2, $3, $4, $5, $6)`,
        [ctx.orgId, id, l.producto, l.presentacion ?? null, l.cantidad, l.costo],
      );
    }
    if (o.confirmar !== false) await db.query("select confirmar_compra($1)", [id]);
    return id;
  });
}

export interface LineaVenta {
  producto: string;
  cantidad: number;
  precio: number;
  descuento?: number;
  presentacion?: string;
}

export interface OpcionesVenta {
  cliente?: string;
  turno?: string;
  offlineId?: string;
  descuento?: number;
  pagos?: { metodo: string; monto: number; comprobante?: string }[];
  confirmar?: boolean;
}

/** Crea una venta en borrador con detalle y pagos y la confirma. Devuelve su id. */
export async function venta(
  db: Bd,
  ctx: Ctx,
  lineas: LineaVenta[],
  o: OpcionesVenta = {},
): Promise<string> {
  const subtotal = lineas.reduce(
    (a, l) => a + Math.round((l.cantidad * l.precio - (l.descuento ?? 0)) * 100) / 100,
    0,
  );
  const total = Math.round((subtotal - (o.descuento ?? 0)) * 100) / 100;
  const pagos = o.pagos ?? [{ metodo: "efectivo", monto: total }];
  return comoUsuario(db, ctx.usuarioId, async () => {
    const v = await db.query<{ id: string }>(
      `insert into ventas (organizacion_id, bodega_id, cliente_id, turno_id, usuario_id, offline_id, descuento)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        ctx.orgId,
        ctx.bodegaId,
        o.cliente ?? null,
        o.turno ?? null,
        ctx.usuarioId,
        o.offlineId ?? null,
        o.descuento ?? 0,
      ],
    );
    const id = v.rows[0]!.id;
    for (const l of lineas) {
      await db.query(
        `insert into ventas_detalle (organizacion_id, venta_id, producto_id, presentacion_id, cantidad, precio_unitario, descuento)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [ctx.orgId, id, l.producto, l.presentacion ?? null, l.cantidad, l.precio, l.descuento ?? 0],
      );
    }
    for (const p of pagos) {
      await db.query(
        `insert into pagos_venta (organizacion_id, venta_id, metodo, monto, comprobante_id)
         values ($1, $2, $3::metodo_pago, $4, $5)`,
        [ctx.orgId, id, p.metodo, p.monto, p.comprobante ?? null],
      );
    }
    if (o.confirmar !== false) await db.query("select confirmar_venta($1)", [id]);
    return id;
  });
}

export async function abrirTurno(db: Bd, ctx: Ctx, base = 0): Promise<string> {
  return comoUsuario(db, ctx.usuarioId, async () => {
    const r = await db.query<{ id: string }>(
      `insert into turnos_caja (organizacion_id, bodega_id, usuario_id, base_inicial)
       values ($1, $2, $3, $4) returning id`,
      [ctx.orgId, ctx.bodegaId, ctx.usuarioId, base],
    );
    return r.rows[0]!.id;
  });
}

export async function comprobante(
  db: Bd,
  orgId: string,
  o: { hash?: string; referencia?: string; monto?: number | null } = {},
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into comprobantes (organizacion_id, imagen_url, hash_imagen, referencia, entidad, monto_leido)
     values ($1, 'comprobantes/x.jpg', $2, $3, 'nequi', $4) returning id`,
    [orgId, o.hash ?? null, o.referencia ?? null, o.monto === undefined ? null : o.monto],
  );
  return r.rows[0]!.id;
}

// --------------------------- lecturas de apoyo ----------------------------

export async function existencia(
  db: Bd,
  productoId: string,
  bodegaId: string,
): Promise<{ cantidad: number; costo: number }> {
  const r = await db.query<{ cantidad: string; costo_promedio: string }>(
    "select cantidad::text, costo_promedio::text from existencias where producto_id = $1 and bodega_id = $2",
    [productoId, bodegaId],
  );
  const f = r.rows[0];
  return f
    ? { cantidad: Number(f.cantidad), costo: Number(f.costo_promedio) }
    : { cantidad: 0, costo: 0 };
}

export async function eventos(db: Bd, orgId: string, tipo?: string) {
  const r = await db.query<{ tipo: string; payload: Record<string, unknown> }>(
    `select tipo, payload from eventos_outbox where organizacion_id = $1 and ($2::text is null or tipo = $2)
     order by id`,
    [orgId, tipo ?? null],
  );
  return r.rows;
}
