/** Migración 0035: marco de facturación electrónica (proveedor simulado). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";
import { esquemaDocumentoFactura, proveedorSimulado } from "@/server/facturacion/proveedores";
import { type Ctx, abrirTurno, cliente, compra, producto, venta } from "./fabrica";

let db: Bd;
let ctx: Ctx;
let vendedor: string;
let contador: string;
let turno: string;
let iva19: string;
let exento: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const q = async <T extends object>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const servicio = async <T>(fn: () => Promise<T>) => { await db.exec("set role service_role"); try { return await fn(); } finally { await db.exec("reset role"); } };
const configurar = (o: { activa?: boolean; ambiente?: string; proveedor?: string; desde?: number; hasta?: number; vigencia?: string; cf?: number; nit?: string | null } = {}) =>
  como(ctx.usuarioId, () =>
    db.query("select guardar_config_facturacion($1,$2,$3,$4,$5,'7','Ferretería Alfa SAS','FE','18764000001','2026-01-15',$6,$7,$8,$9)", [
      ctx.orgId, o.activa ?? true, o.ambiente ?? "pruebas", o.proveedor ?? "simulado", o.nit === undefined ? "900123456" : o.nit, o.desde ?? 1000, o.hasta ?? 1005, o.vigencia ?? "2030-12-31", o.cf ?? 261870,
    ]),
  );
const facturar = (v: string, u = vendedor) => como(u, async () => (await q<{ id: string }>("select solicitar_factura_electronica($1) id", [v]))[0]!.id);
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- el documento es JSON libre; cada prueba verifica solo los campos que le importan
const factura = async (id: string) => (await q<{ estado: string; numero: string; prefijo: string; documento: Record<string, any>; intentos: number; cufe: string | null }>("select estado, numero::text, prefijo, documento, intentos, cufe from facturas_electronicas where id=$1", [id]))[0]!;
const vender = (lineas: { producto: string; cantidad: number; precio: number }[], o: { cliente?: string; descuento?: number } = {}) =>
  venta(db, { ...ctx, usuarioId: vendedor }, lineas, { turno, ...o });

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Ferretería Alfa", "fe@x.co");
  ctx = { orgId: n.orgId, usuarioId: n.duenoId, bodegaId: n.bodegaId };
  vendedor = await agregarMiembro(db, n.orgId, "v@fe.co", "vendedor");
  contador = await agregarMiembro(db, n.orgId, "c@fe.co", "contador");
  iva19 = await producto(db, n.orgId, { nombre: "Taladro", precio: 119000 });
  exento = await producto(db, n.orgId, { nombre: "Libro de cuentas", precio: 10000 });
  await db.query("update productos set iva_pct = 19 where id = $1", [iva19]);
  await compra(db, ctx, [{ producto: iva19, cantidad: 50, costo: 80000 }, { producto: exento, cantidad: 50, costo: 5000 }]);
  turno = await abrirTurno(db, { ...ctx, usuarioId: vendedor }, 0);
});
afterAll(async () => db.close());

describe("configuración", () => {
  it("solo dueño o admin; el proveedor simulado no sirve en producción; activar exige todos los datos", async () => {
    expect(await mensajeDeError(() => como(vendedor, () => db.query("select guardar_config_facturacion($1,true,'pruebas','simulado','900123456','7','X SAS','FE','1','2026-01-01',1,10,'2030-01-01',261870)", [ctx.orgId])))).toMatch(/Solo dueño o admin/);
    expect(await mensajeDeError(() => configurar({ ambiente: "produccion", proveedor: "simulado" }))).toMatch(/solo sirve en pruebas/);
    expect(await mensajeDeError(() => configurar({ nit: null }))).toMatch(/completa NIT/);
    expect(await mensajeDeError(() => configurar({ nit: "12ab" }))).toMatch(/Revisa los datos fiscales/);
    expect(await mensajeDeError(() => configurar({ desde: 10, hasta: 5 }))).toMatch(/Revisa los datos fiscales/);
  });
  it("sin configurar no se puede facturar", async () => {
    const v = await vender([{ producto: exento, cantidad: 1, precio: 10000 }]);
    expect(await mensajeDeError(() => facturar(v))).toMatch(/no está activa/);
  });
});

describe("solicitar_factura_electronica", () => {
  beforeAll(async () => { await configurar(); });

  it("arma el documento: IVA hacia atrás sobre precios con IVA incluido, y suma exacta", async () => {
    const v = await vender([{ producto: iva19, cantidad: 2, precio: 119000 }, { producto: exento, cantidad: 1, precio: 10000 }]);
    const f = await factura(await facturar(v));
    expect(f).toMatchObject({ estado: "pendiente", prefijo: "FE", numero: "1000" });
    const d = f.documento;
    expect(d.numero_completo).toBe("FE1000");
    expect(d.receptor).toMatchObject({ tipo_documento: "CONSUMIDOR_FINAL", documento: "222222222222" });
    expect(d.totales).toMatchObject({ base: 200000 + 10000, iva: 38000, total: 248000 });
    expect(d.totales.por_tarifa).toEqual({ "19": { base: 200000, iva: 38000 }, "0": { base: 10000, iva: 0 } });
    const l = d.lineas.find((x: { descripcion: string }) => x.descripcion === "Taladro");
    expect(l).toMatchObject({ cantidad: 2, base: 200000, iva_pct: 19, iva: 38000, total: 238000 });
    expect(d.emisor).toMatchObject({ nit: "900123456", prefijo: "FE", rango_desde: 1000, rango_hasta: 1005 });
    expect(d.forma_pago).toBe("contado");
  });

  it("el documento de la base de datos cumple el contrato que valida el proveedor, y el simulado lo acepta", async () => {
    const v = await vender([{ producto: iva19, cantidad: 1, precio: 119000 }]);
    const f = await factura(await facturar(v));
    const doc = esquemaDocumentoFactura.parse(f.documento);
    const r = await proveedorSimulado.enviar(doc);
    expect(r.estado).toBe("aceptada");
    expect(r.cufe).toMatch(/^SIMULADO-[0-9a-f]{40}$/);
  });

  it("el descuento general se reparte entre las líneas y los totales siguen cuadrando con la venta", async () => {
    const v = await vender([{ producto: iva19, cantidad: 1, precio: 119000 }, { producto: exento, cantidad: 3, precio: 10000 }], { descuento: 14900 });
    const f = await factura(await facturar(v));
    const d = f.documento;
    expect(d.totales.total).toBe(119000 + 30000 - 14900);
    const suma = d.lineas.reduce((t: number, l: { total: number }) => t + l.total, 0);
    const descuentos = d.lineas.reduce((t: number, l: { descuento_general: number }) => t + l.descuento_general, 0);
    expect(suma).toBeCloseTo(d.totales.total, 2);
    expect(descuentos).toBeCloseTo(14900, 2);
    expect(d.totales.base + d.totales.iva).toBeCloseTo(d.totales.total, 2);
  });

  it("es idempotente: pedirla otra vez devuelve la misma factura y no gasta otro número", async () => {
    const v = await vender([{ producto: exento, cantidad: 1, precio: 10000 }]);
    const a = await facturar(v);
    const b = await facturar(v);
    expect(b).toBe(a);
    const siguiente = (await q<{ s: string }>("select siguiente_numero::text s from config_facturacion where organizacion_id=$1", [ctx.orgId]))[0]!.s;
    expect(Number(siguiente)).toBe(Number((await factura(a)).numero) + 1);
  });

  it("con cliente identificado usa su documento; sobre el tope de consumidor final lo exige", async () => {
    const grande = await vender([{ producto: iva19, cantidad: 3, precio: 119000 }]); // 357.000 > 261.870
    expect(await mensajeDeError(() => facturar(grande))).toMatch(/tope para consumidor final/);
    const c = await cliente(db, ctx.orgId, { nombre: "Constructora Sol SAS" });
    await db.query("update clientes set documento='901555444', tipo_documento='NIT' where id=$1", [c]);
    const v = await vender([{ producto: iva19, cantidad: 3, precio: 119000 }], { cliente: c });
    expect((await factura(await facturar(v))).documento.receptor).toEqual({ tipo_documento: "NIT", documento: "901555444", nombre: "Constructora Sol SAS" });
  });

  it("solo se factura una venta confirmada, y solo roles que venden", async () => {
    const v = await vender([{ producto: exento, cantidad: 1, precio: 10000 }]);
    expect(await mensajeDeError(() => facturar(v, contador))).toMatch(/Sin permiso para facturar/);
    await como(ctx.usuarioId, () => db.query("select anular_venta($1, 'Error de digitación')", [v]));
    expect(await mensajeDeError(() => facturar(v))).toMatch(/venta confirmada/);
  });

  it("se agota la numeración autorizada y no deja pasarse del rango", async () => {
    await configurar({ desde: 2000, hasta: 2001 });
    for (let i = 0; i < 2; i++) await facturar(await vender([{ producto: exento, cantidad: 1, precio: 10000 }]));
    expect(await mensajeDeError(async () => facturar(await vender([{ producto: exento, cantidad: 1, precio: 10000 }])))).toMatch(/Se agotó la numeración/);
    await configurar({ desde: 1000, hasta: 1099 });
  });

  it("una resolución vencida bloquea", async () => {
    await configurar({ vigencia: "2020-01-01" });
    expect(await mensajeDeError(async () => facturar(await vender([{ producto: exento, cantidad: 1, precio: 10000 }])))).toMatch(/resolución .* vencida/);
    await configurar();
  });
});

describe("cola de envío y resultados", () => {
  let id: string;
  beforeAll(async () => {
    await configurar({ desde: 3000, hasta: 3099 });
    id = await facturar(await vender([{ producto: exento, cantidad: 1, precio: 10000 }]));
  });

  it("el procesador toma las pendientes (con reserva) y cuenta el intento", async () => {
    const tomadas = await servicio(() => q<{ id: string; intentos: number }>("select id, intentos from facturas_pendientes_envio(50)"));
    expect(tomadas.map((t) => t.id)).toContain(id);
    expect((await factura(id)).estado).toBe("enviando");
    expect(await servicio(() => q("select id from facturas_pendientes_envio(50) where id = $1", [id]))).toHaveLength(0); // ya reservada
  });

  it("un error transitorio vuelve a la cola; al quinto intento avisa al dueño", async () => {
    expect(await servicio(async () => (await q<{ r: string }>("select resultado_factura_electronica($1,'error',null,null,null,'{}'::jsonb,'timeout') r", [id]))[0]!.r)).toBe("error");
    expect((await factura(id)).estado).toBe("error");
    await db.query("update facturas_electronicas set intentos = 5 where id=$1", [id]);
    await servicio(() => db.query("select resultado_factura_electronica($1,'error',null,null,null,'{}'::jsonb,'timeout')", [id]));
    expect((await q<{ n: string }>("select count(*)::text n from alertas where tipo='factura_error'"))[0]!.n).toBe("1");
    expect(await servicio(() => q("select id from facturas_pendientes_envio(50) where id = $1", [id]))).toHaveLength(0); // ya no se reintenta sola
  });

  it("rechazada: alerta; reintentar conserva el MISMO número y vuelve a pendiente", async () => {
    const antes = await factura(id);
    await servicio(() => db.query("select resultado_factura_electronica($1,'rechazada',null,null,null,'{\"codigo\":\"FAJ44b\"}'::jsonb,'NIT del adquirente inválido')", [id]));
    expect((await q<{ mensaje: string }>("select mensaje from alertas where tipo='factura_rechazada'"))[0]!.mensaje).toMatch(/rechazó la factura FE3000: NIT del adquirente inválido/);
    expect(await mensajeDeError(() => como(contador, () => db.query("select reintentar_factura_electronica($1)", [id])))).toMatch(/Sin permiso para facturar/);
    await como(vendedor, () => db.query("select reintentar_factura_electronica($1)", [id]));
    const despues = await factura(id);
    expect(despues).toMatchObject({ estado: "pendiente", numero: antes.numero, intentos: 0 });
  });

  it("aceptada exige CUFE y nunca se vuelve a modificar", async () => {
    expect(await mensajeDeError(() => servicio(() => db.query("select resultado_factura_electronica($1,'aceptada',null,null,null,'{}'::jsonb,null)", [id])))).toMatch(/CUFE/);
    expect(await servicio(async () => (await q<{ r: string }>("select resultado_factura_electronica($1,'aceptada','abc123cufe','https://x/f.pdf','https://x/f.xml','{}'::jsonb,null) r", [id]))[0]!.r)).toBe("aceptada");
    expect((await factura(id)).estado).toBe("aceptada");
    expect(await servicio(async () => (await q<{ r: string }>("select resultado_factura_electronica($1,'rechazada',null,null,null,'{}'::jsonb,'tarde') r", [id]))[0]!.r)).toBe("ya_aceptada");
    expect((await factura(id)).cufe).toBe("abc123cufe");
    expect(await mensajeDeError(() => como(vendedor, () => db.query("select reintentar_factura_electronica($1)", [id])))).toMatch(/rechazada o con error/);
  });

  it("anular una venta ya facturada avisa que falta la nota crédito", async () => {
    const ventaId = (await q<{ venta_id: string }>("select venta_id from facturas_electronicas where id=$1", [id]))[0]!.venta_id;
    await como(ctx.usuarioId, () => db.query("select anular_venta($1, 'Devolución total')", [ventaId]));
    const a = await q<{ mensaje: string }>("select mensaje from alertas where tipo='factura_requiere_nota_credito'");
    expect(a).toHaveLength(1);
    expect(a[0]!.mensaje).toMatch(/nota crédito/);
  });

  it("los usuarios no pueden llamar las funciones del procesador", async () => {
    expect(await mensajeDeError(() => como(ctx.usuarioId, () => db.query("select * from facturas_pendientes_envio(5)")))).toMatch(/permission denied|permiso/i);
    expect(await mensajeDeError(() => como(ctx.usuarioId, () => db.query("select resultado_factura_electronica($1,'aceptada','x',null,null,'{}'::jsonb,null)", [id])))).toMatch(/permission denied|permiso/i);
  });

  it("otro negocio no ve ni las facturas ni la configuración", async () => {
    const otro = await crearNegocio(db, "Otro SAS", "o@x.co");
    expect(await como(otro.duenoId, async () => (await q("select id from facturas_electronicas")).length)).toBe(0);
    expect(await como(otro.duenoId, async () => (await q("select organizacion_id from config_facturacion")).length)).toBe(0);
  });
});
