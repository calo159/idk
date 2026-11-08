/** Migración 0020: outbox para n8n (reclamar, finalizar, duplicados y permisos). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";

let db: Bd;
let orgId: string;
let dueno: string;

const comoServicio = async <T>(fn: () => Promise<T>) => {
  await db.exec("set role service_role");
  try { return await fn(); } finally { await db.exec("reset role"); }
};
const reclamar = (n = 50) => comoServicio(async () => (await db.query<{ id: string; tipo: string; telefono_whatsapp: string | null; intentos: number; organizacion: string }>("select id, tipo, telefono_whatsapp, intentos, organizacion from reclamar_eventos($1)", [n])).rows);
const limpiar = () => db.query("delete from eventos_outbox");
const evento = (tipo: string, payload: object = {}) => db.query("insert into eventos_outbox (organizacion_id, tipo, payload) values ($1,$2,$3::jsonb)", [orgId, tipo, JSON.stringify(payload)]);

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Outbox SAS", "o@x.co");
  orgId = n.orgId; dueno = n.duenoId;
  await db.query("update organizaciones set telefono_whatsapp='3015550100' where id=$1", [orgId]);
});
afterAll(async () => db.close());

describe("reclamar_eventos", () => {
  it("entrega los pendientes en orden con el teléfono del dueño y cuenta el intento", async () => {
    await limpiar();
    await evento("venta.anulada", { numero: 5 });
    await evento("ajuste.grande", { valor: 200000 });
    const r = await reclamar();
    expect(r.map((e) => e.tipo)).toEqual(["venta.anulada", "ajuste.grande"]);
    expect(r[0]).toMatchObject({ telefono_whatsapp: "3015550100", intentos: 1, organizacion: "Outbox SAS" });
  });
  it("un evento reclamado no se entrega de nuevo mientras dure su arrendamiento", async () => {
    expect(await reclamar()).toEqual([]);
  });
  it("finalizar con éxito lo marca procesado; con error lo libera y sube hasta 5 intentos", async () => {
    await limpiar();
    await evento("venta.anulada");
    const [e] = await reclamar();
    await comoServicio(() => db.query("select finalizar_evento($1, true)", [e!.id]));
    expect((await db.query("select 1 from eventos_outbox where procesado_en is not null")).rows).toHaveLength(1);

    await limpiar();
    await evento("ajuste.grande");
    for (let i = 1; i <= 5; i++) {
      const [x] = await reclamar();
      expect(x!.intentos).toBe(i);
      await comoServicio(() => db.query("select finalizar_evento($1, false, 'WhatsApp caído')", [x!.id]));
      await db.query("update eventos_outbox set bloqueado_hasta = now() - interval '1 second'"); // vence el arrendamiento
    }
    expect(await reclamar()).toEqual([]); // quedó muerto, no se reintenta más
    const m = await db.query<{ error: string; procesado_en: string | null }>("select error, procesado_en from eventos_outbox");
    expect(m.rows[0]).toMatchObject({ error: "WhatsApp caído", procesado_en: null });
  });
  it("descarta duplicados de stock.bajo del mismo producto en el día, pero no de otro producto", async () => {
    await limpiar();
    await evento("stock.bajo", { producto_id: "p1" });
    await evento("stock.bajo", { producto_id: "p1" });
    await evento("stock.bajo", { producto_id: "p2" });
    const r = await reclamar();
    expect(r).toHaveLength(2);
    const d = await db.query<{ error: string }>("select error from eventos_outbox where error is not null");
    expect(d.rows[0]!.error).toBe("duplicado del día");
  });
  it("comprobante.sospechoso se cubre con la alerta: llega 'alerta.creada' y no el evento crudo", async () => {
    await limpiar();
    await db.query("insert into alertas (organizacion_id, tipo, severidad, mensaje) values ($1,'comprobante_sospechoso','alta','Comprobante repetido')", [orgId]);
    await evento("comprobante.sospechoso", { razon: "repetido" });
    const r = await reclamar();
    expect(r.map((e) => e.tipo)).toEqual(["alerta.creada"]);
  });
  it("cada alerta nueva emite su evento con severidad y mensaje", async () => {
    await limpiar();
    await db.query("insert into alertas (organizacion_id, tipo, severidad, mensaje) values ($1,'faltante_caja','alta','Faltante de $ 12.000')", [orgId]);
    const e = await db.query<{ payload: { severidad: string; mensaje: string } }>("select payload from eventos_outbox where tipo='alerta.creada'");
    expect(e.rows[0]!.payload).toMatchObject({ severidad: "alta", mensaje: "Faltante de $ 12.000" });
  });
  it("valida el límite", async () => {
    expect(await mensajeDeError(() => comoServicio(() => db.query("select * from reclamar_eventos(0)")))).toMatch(/entre 1 y 500/);
  });
});

describe("permisos", () => {
  it("ni un usuario autenticado ni un anónimo pueden reclamar o finalizar eventos", async () => {
    expect(await comoUsuario(db, dueno, () => mensajeDeError(() => db.query("select * from reclamar_eventos(5)")))).toMatch(/permission denied/);
    expect(await comoUsuario(db, dueno, () => mensajeDeError(() => db.query("select finalizar_evento(1, true)")))).toMatch(/permission denied/);
    await db.exec("set role anon");
    try { expect(await mensajeDeError(() => db.query("select * from reclamar_eventos(5)"))).toMatch(/permission denied/); } finally { await db.exec("reset role"); }
  });
  it("los usuarios no pueden leer ni escribir eventos de otros negocios (RLS)", async () => {
    const otro = await agregarMiembro(db, orgId, "otro@o.co", "vendedor");
    const filas = await comoUsuario(db, otro, async () => (await db.query("insert into eventos_outbox (organizacion_id, tipo) values ($1,'falso')", [orgId]).then(() => "insertó").catch(() => "bloqueado")));
    expect(filas).toBe("bloqueado");
  });
});
