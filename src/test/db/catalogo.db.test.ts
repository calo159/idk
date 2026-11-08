/** Migración 0030: catálogo web público. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoAnonimo, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, compra, producto } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let cemento: string;
let oculto: string;
let gratis: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const configurar = (u: string, activo: boolean, slug: string | null, tel: string | null = "3112223344", msg: string | null = null, org = ctx.orgId) =>
  como(u, () => db.query("select configurar_catalogo($1,$2,$3,$4,$5)", [org, activo, slug, tel, msg]));
const publico = () => comoAnonimo(db, async () => (await db.query<Record<string, unknown>>("select * from catalogo_productos('ferreteria-puerto')")).rows);

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Ferretería Puerto", "c@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@c.co", "vendedor");
  cemento = await producto(db, n.orgId, { nombre: "Cemento gris", precio: 34000 });
  await producto(db, n.orgId, { nombre: "Tubo agotado", precio: 8000 });
  oculto = await producto(db, n.orgId, { nombre: "Producto oculto", precio: 5000 });
  gratis = await producto(db, n.orgId, { nombre: "Sin precio", precio: 0 });
  await compra(db, ctx, [{ producto: cemento, cantidad: 40, costo: 28000 }, { producto: oculto, cantidad: 3, costo: 2000 }]);
});
afterAll(async () => db.close());

describe("configurar_catalogo", () => {
  it("apagado por defecto: el público no ve nada", async () => {
    expect(await publico()).toEqual([]);
    expect(await comoAnonimo(db, async () => (await db.query("select * from catalogo_publico('ferreteria-puerto')")).rows)).toEqual([]);
  });

  it("solo dueño o admin; valida dirección, reservadas, teléfono y duplicados", async () => {
    expect(await mensajeDeError(() => configurar(vendedor, true, "ferreteria-puerto"))).toMatch(/Solo dueño o admin/);
    expect(await mensajeDeError(() => configurar(ctx.usuarioId, true, null))).toMatch(/Elige la dirección/);
    expect(await mensajeDeError(() => configurar(ctx.usuarioId, true, "admin"))).toMatch(/reservada/);
    expect(await mensajeDeError(() => configurar(ctx.usuarioId, true, "Mi Tienda!"))).toMatch(/solo puede tener letras/);
    expect(await mensajeDeError(() => configurar(ctx.usuarioId, true, "ab"))).toMatch(/solo puede tener letras/);
    expect(await mensajeDeError(() => configurar(ctx.usuarioId, true, "ferreteria-puerto", "123"))).toMatch(/WhatsApp del negocio/);
    const otro = await crearNegocio(db, "Otra", "o@x.co");
    await configurar(otro.duenoId, true, "otra-tienda", "3001112233", null, otro.orgId);
    expect(await mensajeDeError(() => configurar(ctx.usuarioId, true, "otra-tienda"))).toMatch(/ya la usa otro negocio/);
  });

  it("al activar publica los productos activos con precio, sin costos ni cantidades", async () => {
    await configurar(ctx.usuarioId, true, "Ferreteria-Puerto", "(311) 222-3344", "Domicilios en Riohacha");
    const filas = await publico();
    const nombres = filas.map((f) => f.nombre);
    expect(nombres).toEqual(expect.arrayContaining(["Cemento gris", "Tubo agotado", "Producto oculto"]));
    expect(nombres).not.toContain("Sin precio");
    const c = filas.find((f) => f.nombre === "Cemento gris")!;
    expect(c).toMatchObject({ precio: "34000.00", precio_antes: null, disponible: true });
    expect(Object.keys(c).sort()).toEqual(["categoria", "descripcion", "disponible", "id", "nombre", "precio", "precio_antes", "unidad"]);
    expect(filas.find((f) => f.nombre === "Tubo agotado")!.disponible).toBe(false);
    const cab = await comoAnonimo(db, async () => (await db.query<{ nombre: string; telefono: string; mensaje: string }>("select * from catalogo_publico('FERRETERIA-PUERTO')")).rows[0]);
    expect(cab).toEqual({ nombre: "Ferretería Puerto", telefono: "3112223344", mensaje: "Domicilios en Riohacha" });
  });

  it("ocultar productos los saca del catálogo (y solo el dueño o admin puede)", async () => {
    expect(await mensajeDeError(() => como(vendedor, () => db.query("select publicar_en_catalogo($1,$2,false)", [ctx.orgId, [oculto]])))).toMatch(/Solo dueño o admin/);
    const n = await como(ctx.usuarioId, async () => (await db.query<{ n: number }>("select publicar_en_catalogo($1,$2,false) n", [ctx.orgId, [oculto, gratis]])).rows[0]!.n);
    expect(n).toBe(2);
    expect((await publico()).map((f) => f.nombre)).not.toContain("Producto oculto");
  });

  it("una promoción vigente se ve como precio rebajado con el precio de antes", async () => {
    await como(ctx.usuarioId, () => db.query("select crear_promocion($1,'Oferta',(now() at time zone 'America/Bogota')::date,(now() at time zone 'America/Bogota')::date + 3,$2::jsonb)", [ctx.orgId, JSON.stringify([{ producto_id: cemento, precio: 31000 }])]));
    const c = (await publico()).find((f) => f.nombre === "Cemento gris")!;
    expect(c).toMatchObject({ precio: "31000.00", precio_antes: "34000.00" });
  });

  it("desactivarlo lo apaga de inmediato; sin teléfono del catálogo usa el de WhatsApp del negocio", async () => {
    await configurar(ctx.usuarioId, false, "ferreteria-puerto", null);
    expect(await publico()).toEqual([]);
    await db.query("update organizaciones set telefono_whatsapp='+57 320 111 2233' where id=$1", [ctx.orgId]);
    await db.query("update organizaciones set catalogo_activo=true where id=$1", [ctx.orgId]);
    const tel = await comoAnonimo(db, async () => (await db.query<{ telefono: string }>("select telefono from catalogo_publico('ferreteria-puerto')")).rows[0]!.telefono);
    expect(tel).toBe("573201112233");
  });

  it("el rol anónimo no ve filas de las tablas ni puede configurar", async () => {
    expect(await comoAnonimo(db, async () => (await db.query("select id from productos")).rows)).toEqual([]);
    expect(await comoAnonimo(db, async () => (await db.query("select id from organizaciones")).rows)).toEqual([]);
    expect(await comoAnonimo(db, () => mensajeDeError(() => db.query("select * from configurar_catalogo(null,true,'x','1','')")))).toMatch(/permission denied|permiso/i);
  });
});
