/** Migración 0038: compras en grupo y portal del distribuidor. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, crearUsuario, mensajeDeError } from "./bd";
import { producto } from "./fabrica";

let db: Bd;
let admin: string;
let dist: string; // usuario del distribuidor A
let distB: string; // usuario de otro distribuidor
let distId: string;
let a: { orgId: string; duenoId: string; bodegaId: string };
let b: { orgId: string; duenoId: string; bodegaId: string };
let c: { orgId: string; duenoId: string; bodegaId: string };
let bodeguero: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const q = async <T extends object>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const manana = async (dias = 5) => (await q<{ d: string }>(`select ((now() at time zone 'America/Bogota')::date + ${dias})::text d`))[0]!.d;
const ESCALAS = [{ cantidad_desde: 50, precio_unitario: 9000 }, { cantidad_desde: 100, precio_unitario: 8500 }, { cantidad_desde: 200, precio_unitario: 8000 }];
const crear = async (o: { escalas?: unknown; cierra?: string; min?: number; max?: number | null; titulo?: string; user?: string; dist?: string } = {}) =>
  como(o.user ?? dist, async () =>
    (await q<{ id: string }>("select crear_oferta_grupal($1,$2,'Cemento gris 50 kg','bulto',10000,$3,$4,$5,$6,$7::jsonb) id", [
      o.dist ?? distId, o.titulo ?? "Cemento en grupo", o.cierra ?? (await manana()), await manana(15), o.min ?? 5, o.max === undefined ? 100 : o.max, JSON.stringify(o.escalas ?? ESCALAS),
    ]))[0]!.id,
  );
const unirse = (u: string, org: string, oferta: string, cantidad: number) => como(u, () => db.query("select comprometer_compra_grupal($1,$2,$3)", [org, oferta, cantidad]));
const abiertas = (u: string, org: string) => como(u, () => q<any>("select * from ofertas_abiertas($1)", [org])); // eslint-disable-line @typescript-eslint/no-explicit-any

beforeAll(async () => {
  db = await crearBd();
  admin = await crearUsuario(db, "soporte@surtix.co");
  await db.query("insert into super_admins (usuario_id) values ($1)", [admin]);
  dist = await crearUsuario(db, "ventas@cementos.co");
  distB = await crearUsuario(db, "ventas@pinturas.co");
  a = await crearNegocio(db, "Ferretería Alfa", "alfa@x.co");
  b = await crearNegocio(db, "Ferretería Beta", "beta@x.co");
  c = await crearNegocio(db, "Ferretería Gamma", "gamma@x.co");
  bodeguero = await agregarMiembro(db, a.orgId, "bod@alfa.co", "bodeguero");
  await db.query("update organizaciones set telefono_whatsapp='3001112233', ciudad='Riohacha' where id=$1", [a.orgId]);
  distId = await como(admin, async () => (await q<{ id: string }>("select admin_crear_distribuidor('Cementos del Caribe','900111222','3105556677','ventas@cementos.co') id"))[0]!.id);
  await como(admin, () => db.query("select admin_crear_distribuidor('Pinturas del Norte',null,null,'ventas@pinturas.co')"));
});
afterAll(async () => db.close());

describe("alta de distribuidores", () => {
  it("solo el equipo de Surtix; el correo debe tener cuenta", async () => {
    expect(await mensajeDeError(() => como(a.duenoId, () => db.query("select admin_crear_distribuidor('X','1','2','alfa@x.co')")))).toMatch(/Solo el equipo de Surtix/);
    expect(await mensajeDeError(() => como(admin, () => db.query("select admin_crear_distribuidor('X','1','2','nadie@x.co')")))).toMatch(/aún no tiene cuenta/);
  });
  it("el distribuidor ve solo lo suyo", async () => {
    expect(await como(dist, async () => (await q<{ nombre: string }>("select nombre from distribuidores")).map((x) => x.nombre))).toEqual(["Cementos del Caribe"]);
    expect(await como(distB, async () => (await q<{ nombre: string }>("select nombre from mis_distribuidores()")).map((x) => x.nombre))).toEqual(["Pinturas del Norte"]);
    expect(await como(a.duenoId, async () => (await q("select * from distribuidores")).length)).toBe(0);
    expect(await mensajeDeError(() => como(dist, () => db.query("insert into distribuidores (nombre) values ('Yo')")))).toMatch(/row-level security/i);
  });
});

describe("publicar ofertas", () => {
  it("solo un usuario del distribuidor publica en su nombre", async () => {
    expect(await mensajeDeError(() => crear({ user: distB }))).toMatch(/No tienes permiso en este distribuidor/);
    expect(await mensajeDeError(() => crear({ user: a.duenoId }))).toMatch(/No tienes permiso/);
  });
  it("valida fechas y escalas", async () => {
    const [hoy, lejos] = [await manana(0), await manana(61)];
    expect(await mensajeDeError(() => crear({ cierra: hoy }))).toMatch(/entre mañana y 60 días/);
    expect(await mensajeDeError(() => crear({ cierra: lejos }))).toMatch(/entre mañana y 60 días/);
    expect(await mensajeDeError(() => crear({ escalas: [] }))).toMatch(/de 1 a 6 escalas/);
    expect(await mensajeDeError(() => crear({ escalas: [{ cantidad_desde: 50, precio_unitario: 10500 }] }))).toMatch(/menor al precio normal/);
    expect(await mensajeDeError(() => crear({ escalas: [{ cantidad_desde: 50, precio_unitario: 9000 }, { cantidad_desde: 100, precio_unitario: 9500 }] }))).toMatch(/el precio debe bajar/);
    expect(await mensajeDeError(() => crear({ escalas: [{ cantidad_desde: 50, precio_unitario: 9000 }, { cantidad_desde: 50, precio_unitario: 8000 }] }))).toMatch(/distintas y crecientes/);
  });
  it("una oferta inválida no deja basura a medias", async () => {
    const antes = (await q<{ n: string }>("select count(*)::text n from ofertas_grupales"))[0]!.n;
    await mensajeDeError(() => crear({ escalas: [{ cantidad_desde: 50, precio_unitario: 99999 }] }));
    expect((await q<{ n: string }>("select count(*)::text n from ofertas_grupales"))[0]!.n).toBe(antes);
  });
});

describe("unirse y precio por volumen", () => {
  let oferta: string;
  beforeAll(async () => { oferta = await crear(); });

  it("los negocios ven la oferta abierta sin precio hasta alcanzar la primera escala", async () => {
    const o = (await abiertas(a.duenoId, a.orgId)).find((x: { oferta_id: string }) => x.oferta_id === oferta);
    expect(o).toMatchObject({ distribuidor: "Cementos del Caribe", titulo: "Cemento en grupo", total_comprometido: "0", negocios: 0, precio_actual: null, mi_cantidad: null });
    expect(o.escalas).toEqual([{ desde: 50, precio: 9000 }, { desde: 100, precio: 8500 }, { desde: 200, precio: 8000 }]);
  });

  it("el precio baja para todos a medida que se junta volumen", async () => {
    await unirse(a.duenoId, a.orgId, oferta, 40);
    expect((await abiertas(a.duenoId, a.orgId))[0].precio_actual).toBeNull(); // 40 < 50
    await unirse(b.duenoId, b.orgId, oferta, 30); // 70 → primera escala
    const deA = (await abiertas(a.duenoId, a.orgId))[0];
    expect(deA).toMatchObject({ total_comprometido: "70.000", negocios: 2, precio_actual: "9000.00", mi_cantidad: "40.000" });
    await unirse(c.duenoId, c.orgId, oferta, 40); // 110 → segunda escala
    expect((await abiertas(a.duenoId, a.orgId))[0].precio_actual).toBe("8500.00");
  });

  it("cambiar la cantidad actualiza, no duplica; retirarse baja el total", async () => {
    await unirse(c.duenoId, c.orgId, oferta, 60);
    expect((await q<{ n: string }>("select count(*)::text n from compromisos_grupales where oferta_id=$1 and organizacion_id=$2", [oferta, c.orgId]))[0]!.n).toBe("1");
    expect((await abiertas(a.duenoId, a.orgId))[0].total_comprometido).toBe("130.000");
    await como(c.duenoId, () => db.query("select retirar_compromiso_grupal($1,$2)", [c.orgId, oferta]));
    expect((await abiertas(a.duenoId, a.orgId))[0].total_comprometido).toBe("70.000");
    await unirse(c.duenoId, c.orgId, oferta, 40);
  });

  it("respeta mínimo y máximo por negocio, y los roles", async () => {
    expect(await mensajeDeError(() => unirse(a.duenoId, a.orgId, oferta, 2))).toMatch(/mínima por negocio es 5/);
    expect(await mensajeDeError(() => unirse(a.duenoId, a.orgId, oferta, 101))).toMatch(/máxima por negocio es 100/);
    expect(await mensajeDeError(() => unirse(bodeguero, a.orgId, oferta, 10))).toMatch(/Solo dueño o admin/);
    expect(await mensajeDeError(() => unirse(b.duenoId, a.orgId, oferta, 10))).toMatch(/Solo dueño o admin/); // de otro negocio
  });

  it("un negocio nunca ve quién más se unió, solo el total; y solo ve sus propios compromisos", async () => {
    const texto = JSON.stringify(await abiertas(a.duenoId, a.orgId));
    expect(texto).not.toMatch(/Beta|Gamma/);
    expect(await como(a.duenoId, async () => (await q<{ organizacion_id: string }>("select organizacion_id from compromisos_grupales")).map((x) => x.organizacion_id))).toEqual([a.orgId]);
  });

  it("otro distribuidor no ve ni los compromisos ni las ofertas de este", async () => {
    expect(await mensajeDeError(() => como(distB, () => db.query("select * from compromisos_de_oferta($1)", [oferta])))).toMatch(/Oferta no existe/);
    expect(await como(distB, async () => (await q("select * from ofertas_grupales")).length)).toBe(0);
    expect(await mensajeDeError(() => como(distB, () => db.query("select cerrar_oferta_grupal($1)", [oferta])))).toMatch(/Oferta no existe/);
  });
});

describe("cierre", () => {
  it("cerrar con el volumen suficiente fija el precio de la escala alcanzada y avisa a cada negocio", async () => {
    const oferta = await crear({ titulo: "Para cerrar" });
    await unirse(a.duenoId, a.orgId, oferta, 60);
    await unirse(b.duenoId, b.orgId, oferta, 45); // 105 → escala 100: $ 8.500
    expect(await como(dist, async () => (await q<{ r: string }>("select cerrar_oferta_grupal($1) r", [oferta]))[0]!.r)).toBe("cerrada");
    const o = (await q<{ estado: string; precio_final: string; total_final: string }>("select estado, precio_final::text, total_final::text from ofertas_grupales where id=$1", [oferta]))[0]!;
    expect(o).toEqual({ estado: "cerrada", precio_final: "8500.00", total_final: "105.000" });
    const alertas = await q<{ mensaje: string; organizacion_id: string }>("select mensaje, organizacion_id from alertas where datos->>'oferta_id' = $1", [oferta]);
    expect(alertas).toHaveLength(2);
    expect(alertas.find((x) => x.organizacion_id === a.orgId)!.mensaje).toMatch(/pagas \$ 8\.500 por 60 unidades \(total \$ 510\.000\)/);
    expect(await mensajeDeError(() => como(dist, () => db.query("select cerrar_oferta_grupal($1)", [oferta])))).toMatch(/ya no está abierta/);
    expect(await mensajeDeError(() => unirse(c.duenoId, c.orgId, oferta, 10))).toMatch(/ya no está abierta/);
    expect(await mensajeDeError(() => como(a.duenoId, () => db.query("select retirar_compromiso_grupal($1,$2)", [a.orgId, oferta])))).toMatch(/Ya no puedes retirarte/);
  });

  it("si no se llega a la primera escala se cancela sin cobrar a nadie", async () => {
    const oferta = await crear({ titulo: "Sin volumen" });
    await unirse(a.duenoId, a.orgId, oferta, 10);
    expect(await como(dist, async () => (await q<{ r: string }>("select cerrar_oferta_grupal($1) r", [oferta]))[0]!.r)).toBe("cancelada");
    expect((await q<{ mensaje: string }>("select mensaje from alertas where datos->>'oferta_id' = $1", [oferta]))[0]!.mensaje).toMatch(/no se juntó la cantidad mínima. No tienes que pagar nada/);
    expect((await q<{ precio_final: string | null }>("select precio_final from ofertas_grupales where id=$1", [oferta]))[0]!.precio_final).toBeNull();
  });

  it("el distribuidor puede cancelar con motivo y se avisa a los participantes", async () => {
    const oferta = await crear({ titulo: "Se cae" });
    await unirse(b.duenoId, b.orgId, oferta, 10);
    expect(await mensajeDeError(() => como(dist, () => db.query("select cancelar_oferta_grupal($1, '')", [oferta])))).toMatch(/motivo/);
    await como(dist, () => db.query("select cancelar_oferta_grupal($1, 'Se agotó el lote')", [oferta]));
    expect((await q<{ mensaje: string }>("select mensaje from alertas where organizacion_id=$1 and datos->>'oferta_id'=$2", [b.orgId, oferta]))[0]!.mensaje).toMatch(/canceló la compra grupal «Se cae»: Se agotó el lote/);
  });

  it("una oferta que ya venció no admite más compromisos", async () => {
    const oferta = await crear({ titulo: "Vencida" });
    await db.query("update ofertas_grupales set cierra_en = (now() at time zone 'America/Bogota')::date - 1 where id=$1", [oferta]);
    expect(await mensajeDeError(() => unirse(a.duenoId, a.orgId, oferta, 10))).toMatch(/ya no está abierta/);
    expect((await abiertas(a.duenoId, a.orgId)).some((x: { oferta_id: string }) => x.oferta_id === oferta)).toBe(false);
  });
});

describe("entrega y orden de compra", () => {
  let oferta: string;
  beforeAll(async () => {
    oferta = await crear({ titulo: "Entrega" });
    await unirse(a.duenoId, a.orgId, oferta, 60);
    await unirse(b.duenoId, b.orgId, oferta, 45);
    await como(dist, () => db.query("select cerrar_oferta_grupal($1)", [oferta]));
  });

  it("el distribuidor ve a quién entregar: nombre, ciudad, WhatsApp, cantidad y total", async () => {
    const filas = await como(dist, () => q<any>("select * from compromisos_de_oferta($1)", [oferta])); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(filas).toHaveLength(2);
    expect(filas[0]).toEqual({ negocio: "Ferretería Alfa", ciudad: "Riohacha", whatsapp: "3001112233", cantidad: "60.000", total_a_pagar: "510000.00" });
    expect(Object.keys(filas[0]).sort()).toEqual(["cantidad", "ciudad", "negocio", "total_a_pagar", "whatsapp"]);
  });

  it("el negocio convierte su compromiso en una orden de compra en borrador, una sola vez", async () => {
    const prod = await producto(db, a.orgId, { nombre: "Cemento gris", precio: 12000 });
    const oc = await como(a.duenoId, async () => (await q<{ id: string }>("select crear_orden_desde_oferta($1,$2,$3,$4) id", [a.orgId, oferta, prod, a.bodegaId]))[0]!.id);
    const linea = (await q<{ cantidad_pedida: string; costo_unitario: string }>("select cantidad_pedida::text, costo_unitario::text from ordenes_compra_detalle where orden_id=$1", [oc]))[0]!;
    expect(linea).toEqual({ cantidad_pedida: "60.000", costo_unitario: "8500.00" });
    expect((await q<{ nombre: string }>("select p.nombre from ordenes_compra o join proveedores p on p.id=o.proveedor_id where o.id=$1", [oc]))[0]!.nombre).toBe("Cementos del Caribe");
    const otra = await como(a.duenoId, async () => (await q<{ id: string }>("select crear_orden_desde_oferta($1,$2,$3,$4) id", [a.orgId, oferta, prod, a.bodegaId]))[0]!.id);
    expect(otra).toBe(oc);
    expect((await q<{ n: string }>("select count(*)::text n from proveedores where organizacion_id=$1 and nombre='Cementos del Caribe'", [a.orgId]))[0]!.n).toBe("1");
  });

  it("no se crea orden si la compra no se cerró o si el negocio no participó", async () => {
    const abierta = await crear({ titulo: "Aún abierta" });
    await unirse(a.duenoId, a.orgId, abierta, 10);
    const prod = (await q<{ id: string }>("select id from productos where organizacion_id=$1 limit 1", [a.orgId]))[0]!.id;
    expect(await mensajeDeError(() => como(a.duenoId, () => db.query("select crear_orden_desde_oferta($1,$2,$3,$4)", [a.orgId, abierta, prod, a.bodegaId])))).toMatch(/aún no se ha cerrado/);
    expect(await mensajeDeError(() => como(c.duenoId, () => db.query("select crear_orden_desde_oferta($1,$2,$3,$4)", [c.orgId, oferta, prod, c.bodegaId])))).toMatch(/no participó/);
  });

  it("entregada solo desde cerrada", async () => {
    await como(dist, () => db.query("select entregar_oferta_grupal($1)", [oferta]));
    expect((await q<{ estado: string }>("select estado from ofertas_grupales where id=$1", [oferta]))[0]!.estado).toBe("entregada");
    expect(await mensajeDeError(() => como(dist, () => db.query("select entregar_oferta_grupal($1)", [oferta])))).toMatch(/Solo se marca como entregada una oferta cerrada/);
  });

  it("mis_compras_grupales lista lo del negocio con su estado y total", async () => {
    const m = await como(a.duenoId, () => q<{ titulo: string; estado: string; total_a_pagar: string | null }>("select titulo, estado, total_a_pagar::text from mis_compras_grupales($1) where titulo = 'Entrega'", [a.orgId]));
    expect(m).toEqual([{ titulo: "Entrega", estado: "entregada", total_a_pagar: "510000.00" }]);
  });
});
