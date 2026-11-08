/** Migración 0023: bot de WhatsApp del dueño (identificación, confirmaciones, idempotencia y gastos). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";

let db: Bd;
let orgId: string;
let dueno: string;
let admin: string;
let vendedor: string;

const servicio = async <T>(fn: () => Promise<T>) => {
  await db.exec("set role service_role");
  try { return await fn(); } finally { await db.exec("reset role"); }
};
const q = <T extends object>(sql: string, args: unknown[] = []) => servicio(async () => (await db.query<T>(sql, args)).rows);

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Bot SAS", "bot@x.co");
  orgId = n.orgId; dueno = n.duenoId;
  admin = await agregarMiembro(db, orgId, "admin@b.co", "admin");
  vendedor = await agregarMiembro(db, orgId, "vend@b.co", "vendedor");
  await db.query("update miembros set telefono='300 111 2233' where usuario_id=$1", [admin]);
  await db.query("update miembros set telefono='3009998877' where usuario_id=$1", [vendedor]);
  await db.query("update organizaciones set telefono_whatsapp='+57 301 555 0100' where id=$1", [orgId]);
});
afterAll(async () => db.close());

describe("bot_resolver", () => {
  it("reconoce al administrador por su teléfono, con o sin +57 y espacios", async () => {
    for (const t of ["3001112233", "+57 300 111 2233", "573001112233"]) {
      const r = await q<{ usuario_id: string; rol: string }>("select usuario_id, rol from bot_resolver($1)", [t]);
      expect(r, t).toEqual([{ usuario_id: admin, rol: "admin" }]);
    }
  });
  it("el WhatsApp de alertas del negocio es el del dueño", async () => {
    const r = await q<{ usuario_id: string; organizacion: string }>("select usuario_id, organizacion from bot_resolver('573015550100')");
    expect(r).toEqual([{ usuario_id: dueno, organizacion: "Bot SAS" }]);
  });
  it("un vendedor, un número desconocido o vacío no son reconocidos", async () => {
    expect(await q("select * from bot_resolver('3009998877')")).toEqual([]);
    expect(await q("select * from bot_resolver('3200000000')")).toEqual([]);
    expect(await q("select * from bot_resolver('')")).toEqual([]);
    expect(await q("select * from bot_resolver(null)")).toEqual([]);
  });
  it("un administrador desactivado deja de ser reconocido", async () => {
    await db.query("update miembros set activo=false where usuario_id=$1", [admin]);
    expect(await q("select * from bot_resolver('3001112233')")).toEqual([]);
    await db.query("update miembros set activo=true where usuario_id=$1", [admin]);
  });
});

describe("idempotencia y acciones pendientes", () => {
  it("un mensaje de WhatsApp reenviado se procesa una sola vez", async () => {
    expect((await q<{ r: boolean }>("select bot_registrar_mensaje('wamid.AAA', $1) r", [orgId]))[0]!.r).toBe(true);
    expect((await q<{ r: boolean }>("select bot_registrar_mensaje('wamid.AAA', $1) r", [orgId]))[0]!.r).toBe(false);
    expect((await q<{ r: boolean }>("select bot_registrar_mensaje('wamid.BBB', $1) r", [orgId]))[0]!.r).toBe(true);
  });
  it("la acción pendiente se toma una sola vez y vence a los 10 minutos", async () => {
    await servicio(() => db.query("select bot_guardar_pendiente('3001112233', $1, $2, $3::jsonb)", [orgId, admin, JSON.stringify({ tipo: "gasto", monto: 45000 })]));
    const a = await q<{ accion: { monto: number } }>("select accion from bot_tomar_pendiente('+57 300 111 2233')");
    expect(a[0]!.accion.monto).toBe(45000);
    expect(await q("select * from bot_tomar_pendiente('3001112233')")).toEqual([]); // ya se usó

    await servicio(() => db.query("select bot_guardar_pendiente('3001112233', $1, $2, '{}'::jsonb)", [orgId, admin]));
    await db.query("update bot_pendientes set expira_en = now() - interval '1 second'");
    expect(await q("select * from bot_tomar_pendiente('3001112233')")).toEqual([]);
  });
  it("una acción nueva reemplaza a la anterior del mismo número", async () => {
    await servicio(() => db.query("select bot_guardar_pendiente('3001112233', $1, $2, '{\"n\":1}'::jsonb)", [orgId, admin]));
    await servicio(() => db.query("select bot_guardar_pendiente('3001112233', $1, $2, '{\"n\":2}'::jsonb)", [orgId, admin]));
    expect((await q<{ accion: { n: number } }>("select accion from bot_tomar_pendiente('3001112233')"))[0]!.accion.n).toBe(2);
  });
});

describe("registrar_gasto_bot", () => {
  it("registra el gasto a nombre del dueño/admin y deja auditoría con origen whatsapp", async () => {
    const id = (await q<{ id: string }>("select registrar_gasto_bot($1,$2,'Transporte','Flete de cemento',45000,'efectivo') id", [orgId, admin]))[0]!.id;
    const g = await db.query<{ monto: string; usuario_id: string; turno_id: string | null }>("select monto::text, usuario_id, turno_id from gastos where id=$1", [id]);
    expect(g.rows[0]).toEqual({ monto: "45000.00", usuario_id: admin, turno_id: null });
    const a = await db.query<{ despues: { origen: string } }>("select despues from auditoria where registro_id=$1", [id]);
    expect(a.rows[0]!.despues.origen).toBe("whatsapp");
  });
  it("rechaza a un vendedor, montos inválidos y crédito", async () => {
    const f = (usuario: string, monto: number, metodo = "efectivo") => mensajeDeError(() => servicio(() => db.query("select registrar_gasto_bot($1,$2,'X','Y',$3,$4)", [orgId, usuario, monto, metodo])));
    expect(await f(vendedor, 1000)).toMatch(/Solo el dueño o un administrador/);
    expect(await f(admin, 0)).toMatch(/monto no es válido/);
    expect(await f(admin, 1_000_000_000)).toMatch(/monto no es válido/);
    expect(await f(admin, 100, "credito")).toMatch(/crédito/);
  });
  it("las tablas internas del bot no se pueden leer desde la app (ni por el dueño)", async () => {
    await db.query("insert into bot_mensajes (mensaje_id, organizacion_id) values ('visible?', $1)", [orgId]);
    const filas = await comoUsuario(db, dueno, async () => [
      ...(await db.query("select * from bot_mensajes")).rows,
      ...(await db.query("select * from bot_pendientes")).rows,
    ]);
    expect(filas).toEqual([]);
  });
  it("un usuario autenticado no puede llamar ninguna función del bot", async () => {
    for (const s of ["select * from bot_resolver('3001112233')", "select bot_registrar_mensaje('x', gen_random_uuid())", "select registrar_gasto_bot(gen_random_uuid(), gen_random_uuid(), 'a','b',1,'efectivo')"]) {
      expect(await comoUsuario(db, dueno, () => mensajeDeError(() => db.query(s))), s).toMatch(/permission denied/);
    }
  });
});
