/** Migración 0019: listas de precios, variantes, lotes con vencimiento y seriales. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, cliente, compra, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let bodeguero: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const uno = async <T>(u: string, sql: string, args: unknown[] = []) => como(u, async () => (await db.query<{ r: T }>(sql, args)).rows[0]!.r);
const filas = async <T extends object>(u: string, sql: string, args: unknown[] = []) => como(u, async () => (await db.query<T>(sql, args)).rows);
const hoyMas = async (dias: number) => (await db.query<{ d: string }>(`select ((now() at time zone 'America/Bogota')::date + ${dias})::text d`)).rows[0]!.d;

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Variedad SAS", "v@x.co", "ropa");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@v.co", "vendedor");
  bodeguero = await agregarMiembro(db, n.orgId, "b@v.co", "bodeguero");
});
afterAll(async () => db.close());

describe("listas de precios", () => {
  it("crear lista, fijar precios (upsert) y asignarla a un cliente", async () => {
    const p = await producto(db, ctx.orgId, { precio: 10000 });
    const cli = await cliente(db, ctx.orgId);
    const lista = await uno<string>(ctx.usuarioId, "select crear_lista_precios($1,'Mayorista') r", [ctx.orgId]);
    await como(ctx.usuarioId, () => db.query("select fijar_precio_lista($1,$2,8500)", [lista, p]));
    await como(ctx.usuarioId, () => db.query("select fijar_precio_lista($1,$2,8000)", [lista, p])); // actualiza, no duplica
    const precios = await db.query<{ precio: string }>("select precio::text from precios_lista where lista_id=$1", [lista]);
    expect(precios.rows).toEqual([{ precio: "8000.00" }]);
    await como(ctx.usuarioId, () => db.query("select asignar_lista_cliente($1,$2)", [cli, lista]));
    expect((await db.query<{ l: string }>("select lista_precios_id l from clientes where id=$1", [cli])).rows[0]!.l).toBe(lista);
    await como(ctx.usuarioId, () => db.query("select asignar_lista_cliente($1,null)", [cli]));
  });
  it("solo dueño/admin; no se mezclan negocios; nombre único y precio no negativo", async () => {
    expect(await mensajeDeError(() => uno(vendedor, "select crear_lista_precios($1,'X') r", [ctx.orgId]))).toMatch(/Solo dueño o admin/);
    const lista = await uno<string>(ctx.usuarioId, "select crear_lista_precios($1,'Constructores') r", [ctx.orgId]);
    const p = await producto(db, ctx.orgId);
    expect(await mensajeDeError(() => como(ctx.usuarioId, () => db.query("select fijar_precio_lista($1,$2,-1)", [lista, p])))).toMatch(/negativo/);
    expect(await mensajeDeError(() => uno(ctx.usuarioId, "select crear_lista_precios($1,'Constructores') r", [ctx.orgId]))).not.toBeNull();
    const otro = await crearNegocio(db, "Otro", "otro@x.co");
    const cAjeno = await cliente(db, otro.orgId);
    expect(await mensajeDeError(() => como(ctx.usuarioId, () => db.query("select asignar_lista_cliente($1,$2)", [cAjeno, lista])))).toMatch(/Cliente no existe/);
    const pAjeno = await producto(db, otro.orgId);
    expect(await mensajeDeError(() => como(ctx.usuarioId, () => db.query("select fijar_precio_lista($1,$2,5)", [lista, pAjeno])))).toMatch(/Producto no existe/);
  });
});

describe("variantes", () => {
  it("crea un producto hijo por combinación con nombre, precio y atributos heredados; no duplica", async () => {
    const base = await producto(db, ctx.orgId, { nombre: "Camiseta polo", precio: 45000 });
    const combos = [{ atributos: { talla: "M", color: "Rojo" } }, { atributos: { talla: "L", color: "Rojo" } }, { atributos: { talla: "M", color: "Azul" }, codigo_barras: "7701999000111" }];
    expect(await uno<number>(bodeguero, "select crear_variantes($1,$2::jsonb) r", [base, JSON.stringify(combos)])).toBe(3);
    const hijos = await db.query<{ nombre: string; precio_venta: string; variante_de: string }>("select nombre, precio_venta::text, variante_de from productos where variante_de=$1 order by nombre", [base]);
    // Los atributos se ordenan por nombre (color, talla).
    expect(hijos.rows.map((h) => h.nombre)).toEqual(["Camiseta polo — Azul / M", "Camiseta polo — Rojo / L", "Camiseta polo — Rojo / M"]);
    expect(hijos.rows.every((h) => h.precio_venta === "45000.00" && h.variante_de === base)).toBe(true);
    expect(await uno<number>(bodeguero, "select crear_variantes($1,$2::jsonb) r", [base, JSON.stringify(combos)])).toBe(0); // repetir no duplica
    const conBarras = await db.query("select 1 from productos where codigo_barras='7701999000111'");
    expect(conBarras.rows).toHaveLength(1);
  });
  it("una variante no tiene variantes; valida entradas y permisos", async () => {
    const base = await producto(db, ctx.orgId);
    await uno(bodeguero, "select crear_variantes($1,$2::jsonb) r", [base, JSON.stringify([{ atributos: { talla: "S" } }])]);
    const hijo = (await db.query<{ id: string }>("select id from productos where variante_de=$1", [base])).rows[0]!.id;
    expect(await mensajeDeError(() => uno(bodeguero, "select crear_variantes($1,$2::jsonb) r", [hijo, JSON.stringify([{ atributos: { talla: "M" } }])]))).toMatch(/no puede tener variantes/);
    expect(await mensajeDeError(() => uno(bodeguero, "select crear_variantes($1,'[]'::jsonb) r", [base]))).toMatch(/al menos una variante/);
    expect(await mensajeDeError(() => uno(bodeguero, "select crear_variantes($1,$2::jsonb) r", [base, JSON.stringify([{ atributos: {} }])]))).toMatch(/necesita atributos/);
    expect(await mensajeDeError(() => uno(vendedor, "select crear_variantes($1,$2::jsonb) r", [base, JSON.stringify([{ atributos: { talla: "L" } }])]))).toMatch(/Sin permiso/);
  });
});

describe("lotes y vencimientos", () => {
  it("el saldo de cada lote sale del stock real: se vende primero lo que vence primero", async () => {
    const leche = await producto(db, ctx.orgId, { nombre: "Leche", precio: 4000 });
    await compra(db, ctx, [{ producto: leche, cantidad: 100, costo: 2000 }]);
    await uno(bodeguero, "select registrar_lote($1,$2,$3,'L-A',$4,40) r", [ctx.orgId, leche, ctx.bodegaId, await hoyMas(10)]); // vence primero
    await uno(bodeguero, "select registrar_lote($1,$2,$3,'L-B',$4,60) r", [ctx.orgId, leche, ctx.bodegaId, await hoyMas(90)]);
    const saldos = async () => Object.fromEntries((await filas<{ codigo: string; saldo: string }>(ctx.usuarioId, "select codigo, saldo::text from lotes_con_saldo($1,$2)", [ctx.orgId, leche])).map((x) => [x.codigo, x.saldo]));
    expect(await saldos()).toEqual({ "L-A": "40.000", "L-B": "60.000" });
    // se venden 50: salen los 40 de L-A y 10 de L-B
    const turno = await abrirTurno(db, { ...ctx, usuarioId: vendedor });
    await venta(db, { ...ctx, usuarioId: vendedor }, [{ producto: leche, cantidad: 50, precio: 4000 }], { turno });
    expect(await saldos()).toEqual({ "L-A": "0.000", "L-B": "50.000" });
  });
  it("vencimientos próximos: solo lo que aún tiene saldo y vence dentro del plazo, con el valor en riesgo", async () => {
    const yogur = await producto(db, ctx.orgId, { nombre: "Yogur", precio: 3000 });
    await compra(db, ctx, [{ producto: yogur, cantidad: 20, costo: 1500 }]);
    await uno(bodeguero, "select registrar_lote($1,$2,$3,'Y-1',$4,20) r", [ctx.orgId, yogur, ctx.bodegaId, await hoyMas(5)]);
    const f = await filas<{ producto: string; saldo: string; dias_para_vencer: number; valor_en_riesgo: string }>(ctx.usuarioId, "select producto, saldo::text, dias_para_vencer, valor_en_riesgo::text from vencimientos_proximos($1, 30)", [ctx.orgId]);
    const y = f.find((x) => x.producto === "Yogur")!;
    expect(y).toMatchObject({ saldo: "20.000", dias_para_vencer: 5, valor_en_riesgo: "30000.00" });
    expect(f.find((x) => x.producto === "Leche")).toBeUndefined(); // L-B vence en 90 días
    expect(await filas(ctx.usuarioId, "select 1 from vencimientos_proximos($1, 3)", [ctx.orgId])).toEqual([]);
  });
  it("lote vencido hace días aparece con días negativos; validaciones y permisos", async () => {
    const p = await producto(db, ctx.orgId, { nombre: "Vencido" });
    await compra(db, ctx, [{ producto: p, cantidad: 5, costo: 1000 }]);
    await uno(bodeguero, "select registrar_lote($1,$2,$3,'V-1',$4,5) r", [ctx.orgId, p, ctx.bodegaId, await hoyMas(-3)]);
    const f = await filas<{ dias_para_vencer: number }>(ctx.usuarioId, "select dias_para_vencer from vencimientos_proximos($1, 30) where producto='Vencido'", [ctx.orgId]);
    expect(f[0]!.dias_para_vencer).toBe(-3);
    expect(await mensajeDeError(() => uno(bodeguero, "select registrar_lote($1,$2,$3,' ',null,1) r", [ctx.orgId, p, ctx.bodegaId]))).toMatch(/código/);
    expect(await mensajeDeError(() => uno(bodeguero, "select registrar_lote($1,$2,$3,'X',null,0) r", [ctx.orgId, p, ctx.bodegaId]))).toMatch(/mayor a cero/);
    expect(await mensajeDeError(() => uno(vendedor, "select registrar_lote($1,$2,$3,'X',null,1) r", [ctx.orgId, p, ctx.bodegaId]))).toMatch(/Sin permiso/);
    expect(await mensajeDeError(() => filas(vendedor, "select * from vencimientos_proximos($1, 30)", [ctx.orgId]))).toMatch(/Sin permiso/);
  });
});

describe("seriales y garantía", () => {
  let taladro: string;
  it("registrar seriales los normaliza; uno repetido deshace toda la carga", async () => {
    taladro = await producto(db, ctx.orgId, { nombre: "Taladro", precio: 150000 });
    await db.query("update productos set garantia_dias = 365 where id=$1", [taladro]);
    await compra(db, ctx, [{ producto: taladro, cantidad: 5, costo: 100000 }]);
    expect(await uno<number>(bodeguero, "select registrar_seriales($1,$2,$3,$4::text[]) r", [ctx.orgId, taladro, ctx.bodegaId, ["sn-001", " SN-002 ", "sn-003"]])).toBe(3);
    const guardados = await db.query<{ serial: string }>("select serial from seriales where producto_id=$1 order by serial", [taladro]);
    expect(guardados.rows.map((s) => s.serial)).toEqual(["SN-001", "SN-002", "SN-003"]);
    const e = await mensajeDeError(() => uno(bodeguero, "select registrar_seriales($1,$2,$3,$4::text[]) r", [ctx.orgId, taladro, ctx.bodegaId, ["SN-004", "sn-001"]]));
    expect(e).toMatch(/serial repetido/);
    expect((await db.query("select 1 from seriales where serial='SN-004'")).rows).toHaveLength(0);
  });
  it("vender un serial calcula la garantía y no se puede vender dos veces", async () => {
    const cli = await cliente(db, ctx.orgId, { nombre: "Don Pedro" });
    const turno = await abrirTurno(db, { ...ctx, usuarioId: vendedor }).catch(async () => (await db.query<{ id: string }>("select id from turnos_caja where usuario_id=$1 and estado='abierto'", [vendedor])).rows[0]!.id);
    const v = await venta(db, { ...ctx, usuarioId: vendedor }, [{ producto: taladro, cantidad: 1, precio: 150000 }], { turno, cliente: cli });
    const garantia = await uno<string>(vendedor, "select vender_serial($1,'sn-001')::text r", [v]);
    const esperada = (await db.query<{ d: string }>("select ((now() at time zone 'America/Bogota')::date + 365)::text d")).rows[0]!.d;
    expect(garantia).toBe(esperada);
    expect(await mensajeDeError(() => uno(vendedor, "select vender_serial($1,'SN-001') r", [v]))).toMatch(/ya se vendió/);
    expect(await mensajeDeError(() => uno(vendedor, "select vender_serial($1,'NOEXISTE') r", [v]))).toMatch(/no está registrado/);
    const otroProducto = await producto(db, ctx.orgId);
    await uno(bodeguero, "select registrar_seriales($1,$2,$3,$4::text[]) r", [ctx.orgId, otroProducto, ctx.bodegaId, ["OTRO-1"]]);
    expect(await mensajeDeError(() => uno(vendedor, "select vender_serial($1,'OTRO-1') r", [v]))).toMatch(/no incluye ese producto/);
  });
  it("consultar un serial muestra su historia completa y si sigue en garantía", async () => {
    const f = await filas<{ producto: string; estado: string; cliente: string; en_garantia: boolean; venta_numero: string }>(
      vendedor, "select producto, estado, cliente, en_garantia, venta_numero::text from consultar_serial($1,'sn-001')", [ctx.orgId]);
    expect(f[0]).toMatchObject({ producto: "Taladro", estado: "vendido", cliente: "Don Pedro", en_garantia: true });
    const libre = await filas<{ estado: string; en_garantia: boolean }>(vendedor, "select estado, en_garantia from consultar_serial($1,'SN-002')", [ctx.orgId]);
    expect(libre[0]).toEqual({ estado: "en_stock", en_garantia: false });
    expect(await filas(vendedor, "select * from consultar_serial($1,'NADA')", [ctx.orgId])).toEqual([]);
  });
  it("otro negocio no puede consultar ni vender seriales ajenos", async () => {
    const otro = await crearNegocio(db, "Curioso", "curioso@x.co");
    expect(await mensajeDeError(() => filas(otro.duenoId, "select * from consultar_serial($1,'SN-001')", [ctx.orgId]))).toMatch(/Sin acceso/);
    expect(await como(otro.duenoId, async () => (await db.query("select * from seriales")).rows)).toEqual([]);
  });
});
