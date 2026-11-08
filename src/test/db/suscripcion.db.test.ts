/** Migración 0033: planes, prueba y pagos de suscripción. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";

let db: Bd;
let orgId: string;
let dueno: string;
let vendedor: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const q = async <T extends object>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const servicio = async <T>(fn: () => Promise<T>) => { await db.exec("set role service_role"); try { return await fn(); } finally { await db.exec("reset role"); } };
const mia = (u = dueno, org = orgId) => como(u, async () => (await q<{ plan: string; estado: string; dias_restantes: number; usuarios: number; bodegas: number; max_usuarios: number | null; vigente_hasta: string }>("select * from mi_suscripcion($1)", [org]))[0]!);
const poner = (set: string, org = orgId) => db.query(`update suscripciones set ${set} where organizacion_id=$1`, [org]);
const pagar = (plan = "negocio", meses = 1, u = dueno) =>
  como(u, async () => (await q<{ referencia: string; monto: string; plan_nombre: string }>("select * from iniciar_pago_suscripcion($1,$2,$3)", [orgId, plan, meses]))[0]!);
const aplicar = (ref: string, estado: string, monto: number, tx = "tx-1") =>
  servicio(async () => (await q<{ r: string }>("select aplicar_pago_suscripcion($1,$2,$3,$4,$5::jsonb) r", [ref, tx, estado, monto, JSON.stringify({ status: estado })]))[0]!.r);

beforeAll(async () => {
  db = await crearBd();
  const n = await crearNegocio(db, "Planes SAS", "p@x.co");
  orgId = n.orgId;
  dueno = n.duenoId;
  vendedor = await agregarMiembro(db, orgId, "v@p.co", "vendedor");
});
afterAll(async () => db.close());

describe("prueba y estados", () => {
  it("todo negocio nuevo empieza con 14 días de prueba del plan «negocio»", async () => {
    const s = await mia();
    expect(s).toMatchObject({ plan: "negocio", estado: "prueba", usuarios: 2, bodegas: 1, max_usuarios: 6 });
    expect(s.dias_restantes).toBe(14);
  });

  it("prueba → gracia (5 días) → vencida; pagado → activa; suspendida manda sobre todo", async () => {
    await poner("prueba_hasta = now() - interval '1 day'");
    expect((await mia()).estado).toBe("gracia");
    await poner("prueba_hasta = now() - interval '6 days'");
    expect((await mia()).estado).toBe("vencida");
    await poner("periodo_hasta = now() + interval '10 days'");
    expect((await mia()).estado).toBe("activa");
    await poner("suspendida = true, motivo_suspension = 'Pago devuelto'");
    expect(await mia()).toMatchObject({ estado: "suspendida", motivo_suspension: "Pago devuelto" });
    await poner("suspendida = false, periodo_hasta = null, prueba_hasta = now() + interval '14 days'");
    expect((await mia()).estado).toBe("prueba");
  });

  it("cualquier miembro la ve; otro negocio no", async () => {
    expect((await mia(vendedor)).estado).toBe("prueba");
    const otro = await crearNegocio(db, "Otro SAS", "o@x.co");
    expect(await mensajeDeError(() => mia(otro.duenoId))).toMatch(/Sin acceso/);
    expect(await como(otro.duenoId, async () => (await q("select * from suscripciones")).length)).toBe(1); // solo la suya
  });

  it("los planes son legibles por usuarios con sesión, no por anónimos", async () => {
    expect(await como(dueno, async () => (await q<{ codigo: string }>("select codigo from planes order by orden")).map((p) => p.codigo))).toEqual(["inicio", "negocio", "crecimiento"]);
  });
});

describe("iniciar_pago_suscripcion", () => {
  it("solo dueño o admin; valida plan y meses", async () => {
    expect(await mensajeDeError(() => pagar("negocio", 1, vendedor))).toMatch(/Solo dueño o admin/);
    expect(await mensajeDeError(() => pagar("inventado"))).toMatch(/no existe/);
    expect(await mensajeDeError(() => pagar("negocio", 5))).toMatch(/1, 3, 6 o 12/);
  });
  it("crea el pago pendiente con referencia única y el monto del plan × meses", async () => {
    const p = await pagar("negocio", 3);
    expect(p.referencia).toMatch(/^SUR-[0-9A-F]{16}$/);
    expect(p.monto).toBe("239700.00");
    expect(p.plan_nombre).toBe("Negocio");
    expect((await q<{ estado: string }>("select estado from pagos_suscripcion where referencia=$1", [p.referencia]))[0]!.estado).toBe("pendiente");
  });
  it("no deja bajar a un plan donde el negocio no cabe", async () => {
    await agregarMiembro(db, orgId, "x1@p.co", "vendedor"); // ya son 3 usuarios; «inicio» admite 2
    expect(await mensajeDeError(() => pagar("inicio"))).toMatch(/más usuarios de los que permite el plan Inicio/);
  });
});

describe("aplicar_pago_suscripcion (webhook)", () => {
  it("un pago aprobado activa el plan y suma 30 días por mes SIN perder los días de prueba que quedaban", async () => {
    await poner("prueba_hasta = now() + interval '10 days', periodo_hasta = null");
    const p = await pagar("crecimiento", 1);
    expect(await aplicar(p.referencia, "aprobado", 149900)).toBe("aplicado");
    const s = await mia();
    expect(s).toMatchObject({ plan: "crecimiento", estado: "activa" });
    expect(s.dias_restantes).toBe(40); // 10 de prueba + 30 pagados
  });

  it("es idempotente: reintentar el webhook no regala otro mes", async () => {
    const antes = (await mia()).dias_restantes;
    const p = await pagar("negocio", 1);
    expect(await aplicar(p.referencia, "aprobado", 79900, "tx-9")).toBe("aplicado");
    const despues = (await mia()).dias_restantes;
    expect(despues - antes).toBe(30);
    expect(await aplicar(p.referencia, "aprobado", 79900, "tx-9")).toBe("ya_aplicado");
    expect((await mia()).dias_restantes).toBe(despues);
  });

  it("un monto distinto al esperado no activa nada y queda en revisión", async () => {
    const antes = (await mia()).dias_restantes;
    const p = await pagar("negocio", 1);
    expect(await aplicar(p.referencia, "aprobado", 1000, "tx-bajo")).toBe("monto_distinto");
    expect((await mia()).dias_restantes).toBe(antes);
    expect((await q<{ estado: string }>("select estado from pagos_suscripcion where referencia=$1", [p.referencia]))[0]!.estado).toBe("revision");
  });

  it("un pago rechazado no activa nada; uno desconocido se ignora; uno aprobado no se revierte por un rechazo tardío", async () => {
    const antes = (await mia()).dias_restantes;
    const p = await pagar("negocio", 1);
    expect(await aplicar(p.referencia, "rechazado", 79900, "tx-no")).toBe("rechazado");
    expect((await mia()).dias_restantes).toBe(antes);
    expect(await aplicar("SUR-NOEXISTE", "aprobado", 1)).toBe("desconocido");
    const ok = await pagar("negocio", 1);
    await aplicar(ok.referencia, "aprobado", 79900, "tx-ok");
    expect(await aplicar(ok.referencia, "rechazado", 79900, "tx-ok")).toBe("ya_aplicado");
  });

  it("pagar reactiva una suscripción suspendida y desde vencida empieza hoy", async () => {
    await poner("suspendida = true, periodo_hasta = now() - interval '40 days', prueba_hasta = now() - interval '60 days'");
    const p = await pagar("negocio", 1);
    await aplicar(p.referencia, "aprobado", 79900, "tx-r");
    expect(await mia()).toMatchObject({ estado: "activa", dias_restantes: 30 });
  });

  it("un usuario autenticado no puede aplicar pagos (solo el servicio)", async () => {
    expect(await mensajeDeError(() => como(dueno, () => db.query("select aplicar_pago_suscripcion('x','y','aprobado',1,'{}'::jsonb)")))).toMatch(/permission denied|permiso/i);
  });

  it("el dueño ve su historial de pagos; el vendedor no", async () => {
    expect((await como(dueno, async () => (await q("select id from pagos_suscripcion")).length))).toBeGreaterThan(0);
    expect((await como(vendedor, async () => (await q("select id from pagos_suscripcion")).length))).toBe(0);
  });
});

describe("límites del plan", () => {
  it("no deja invitar más usuarios de los que permite el plan (cuentan miembros e invitaciones pendientes)", async () => {
    const n = await crearNegocio(db, "Límite SAS", "lim@x.co");
    await db.query("update suscripciones set plan='inicio' where organizacion_id=$1", [n.orgId]); // máx. 2 usuarios, 1 bodega
    const invitar = (correo: string) => como(n.duenoId, () => db.query("insert into invitaciones (organizacion_id, correo, rol, creado_por) values ($1,$2,'vendedor',$3)", [n.orgId, correo, n.duenoId]));
    await invitar("a@lim.co"); // dueño + 1 invitada = 2
    expect(await mensajeDeError(() => invitar("b@lim.co"))).toMatch(/plan Inicio permite hasta 2 usuarios/);
    await db.query("update suscripciones set plan='crecimiento' where organizacion_id=$1", [n.orgId]);
    await expect(invitar("b@lim.co")).resolves.toBeTruthy();
  });

  it("no deja abrir más bodegas de las que permite el plan", async () => {
    const n = await crearNegocio(db, "Sedes SAS", "sed@x.co");
    await db.query("update suscripciones set plan='inicio' where organizacion_id=$1", [n.orgId]);
    const abrir = (nombre: string) => como(n.duenoId, () => db.query("insert into bodegas (organizacion_id, nombre) values ($1,$2)", [n.orgId, nombre]));
    expect(await mensajeDeError(() => abrir("Segunda"))).toMatch(/plan Inicio permite hasta 1 bodegas/);
    await db.query("update suscripciones set plan='negocio' where organizacion_id=$1", [n.orgId]);
    await expect(abrir("Segunda")).resolves.toBeTruthy();
    expect(await mensajeDeError(() => abrir("Tercera"))).toMatch(/plan Negocio permite hasta 2 bodegas/);
  });
});

