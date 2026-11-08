/** Migración 0034: panel de super-admin. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, comoUsuario, crearBd, crearNegocio, crearUsuario, mensajeDeError } from "./bd";
import { type Ctx, abrirTurno, compra, producto, venta } from "./fabrica";

let db: Bd;
let admin: string;
let a: { orgId: string; duenoId: string; bodegaId: string };
let b: { orgId: string; duenoId: string; bodegaId: string };

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const q = async <T extends object>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const sus = (org: string) => q<{ estado: string; plan: string; dias_restantes: number }>("select estado, plan, dias_restantes from mi_suscripcion_interna($1)", [org]).then((r) => r[0]!);

beforeAll(async () => {
  db = await crearBd();
  a = await crearNegocio(db, "Ferretería Alfa", "alfa@x.co");
  b = await crearNegocio(db, "Veterinaria Beta", "beta@x.co", "veterinaria");
  admin = await crearUsuario(db, "soporte@surtix.co");
  await db.query("insert into super_admins (usuario_id) values ($1)", [admin]);
  // Alfa tiene actividad (una venta); Beta no.
  const ctx: Ctx = { orgId: a.orgId, usuarioId: a.duenoId, bodegaId: a.bodegaId };
  const p = await producto(db, a.orgId, { nombre: "Cemento", precio: 30000 });
  await compra(db, ctx, [{ producto: p, cantidad: 10, costo: 20000 }]);
  const turno = await abrirTurno(db, ctx, 0);
  await venta(db, ctx, [{ producto: p, cantidad: 1, precio: 30000 }], { turno });
});
afterAll(async () => db.close());

describe("acceso", () => {
  it("es_super_admin: solo quien está en la tabla", async () => {
    expect(await como(admin, async () => (await q<{ r: boolean }>("select es_super_admin() r"))[0]!.r)).toBe(true);
    expect(await como(a.duenoId, async () => (await q<{ r: boolean }>("select es_super_admin() r"))[0]!.r)).toBe(false);
  });

  it("el dueño de un negocio NO puede usar ninguna función del panel", async () => {
    const intentos = [
      "select admin_metricas()",
      "select * from admin_listar_negocios()",
      `select admin_detalle_negocio('${b.orgId}')`,
      `select admin_cambiar_plan('${b.orgId}', 'inicio', 'prueba')`,
      `select admin_extender_suscripcion('${b.orgId}', 30, 'prueba')`,
      `select admin_suspender('${b.orgId}', true, 'prueba')`,
      `select admin_registrar_pago_manual('${b.orgId}', 'negocio', 1, 79900, 'prueba')`,
    ];
    for (const sql of intentos) expect(await mensajeDeError(() => como(a.duenoId, () => db.query(sql)))).toMatch(/Solo el equipo de Surtix/);
  });

  it("las tablas del panel no se pueden leer ni escribir desde la API", async () => {
    expect(await como(admin, async () => (await q("select * from super_admins")).length)).toBe(0);
    expect(await mensajeDeError(() => como(a.duenoId, () => db.query("insert into super_admins (usuario_id) values ($1)", [a.duenoId])))).toMatch(/row-level security/i);
    expect(await como(admin, async () => (await q("select * from admin_acciones")).length)).toBe(0);
  });

  it("los funciones internas no se pueden llamar directamente", async () => {
    expect(await mensajeDeError(() => como(admin, () => db.query("select exigir_super_admin()")))).toMatch(/permission denied|permiso/i);
    expect(await mensajeDeError(() => como(admin, () => db.query(`select registrar_accion_admin('${a.orgId}', 'x', 'motivo', '{}')`)))).toMatch(/permission denied|permiso/i);
  });
});

describe("consulta", () => {
  it("lista los negocios con plan, estado, uso y dueño; se puede buscar por nombre o correo", async () => {
    const todos = await como(admin, () => q<{ nombre: string; estado: string; plan: string; usuarios: number; ventas_30d: number; correo_dueno: string }>("select nombre, estado, plan, usuarios, ventas_30d, correo_dueno from admin_listar_negocios() order by nombre"));
    expect(todos.map((n) => n.nombre)).toEqual(["Ferretería Alfa", "Veterinaria Beta"]);
    expect(todos[0]).toMatchObject({ estado: "prueba", plan: "negocio", usuarios: 1, ventas_30d: 1, correo_dueno: "alfa@x.co" });
    expect(todos[1]).toMatchObject({ ventas_30d: 0 });
    expect(await como(admin, async () => (await q("select * from admin_listar_negocios('beta')")).length)).toBe(1);
    expect(await como(admin, async () => (await q("select * from admin_listar_negocios('alfa@x.co')")).length)).toBe(1);
    expect(await como(admin, async () => (await q("select * from admin_listar_negocios('nada')")).length)).toBe(0);
  });

  it("métricas globales", async () => {
    const m = await como(admin, async () => (await q<{ m: Record<string, number> }>("select admin_metricas() m"))[0]!.m);
    expect(m).toMatchObject({ negocios: 2, en_prueba: 2, activos: 0, vencidos: 0, mrr: 0 });
  });

  it("el detalle trae equipo y conteos, pero ningún dato comercial (ni clientes, ni precios, ni ventas)", async () => {
    const d = await como(admin, async () => (await q<{ d: Record<string, unknown> }>("select admin_detalle_negocio($1) d", [a.orgId]))[0]!.d);
    expect(Object.keys(d).sort()).toEqual(["acciones", "miembros", "negocio", "pagos", "suscripcion", "uso"]);
    expect(d.uso).toMatchObject({ productos: 1, ventas_total: 1, ventas_30d: 1 });
    expect((d.miembros as { correo: string }[])[0]!.correo).toBe("alfa@x.co");
    expect(await mensajeDeError(() => como(admin, () => db.query("select admin_detalle_negocio($1)", [crypto.randomUUID()])))).toMatch(/Negocio no existe/);
  });
});

describe("acciones de soporte (con motivo y bitácora)", () => {
  it("exigen un motivo", async () => {
    expect(await mensajeDeError(() => como(admin, () => db.query("select admin_suspender($1, true, '')", [b.orgId])))).toMatch(/motivo/);
    expect(await mensajeDeError(() => como(admin, () => db.query("select admin_extender_suscripcion($1, 10, 'x')", [b.orgId])))).toMatch(/motivo/);
  });

  it("cambiar de plan", async () => {
    await como(admin, () => db.query("select admin_cambiar_plan($1, 'crecimiento', 'Cliente piloto')", [b.orgId]));
    expect((await sus(b.orgId)).plan).toBe("crecimiento");
    expect(await mensajeDeError(() => como(admin, () => db.query("select admin_cambiar_plan($1, 'inventado', 'prueba')", [b.orgId])))).toMatch(/no existe/);
  });

  it("extender suma días a lo que ya tenía (14 de prueba + 30)", async () => {
    await como(admin, () => db.query("select admin_extender_suscripcion($1, 30, 'Compensación por caída')", [b.orgId]));
    expect(await sus(b.orgId)).toMatchObject({ estado: "activa", dias_restantes: 44 });
    expect(await mensajeDeError(() => como(admin, () => db.query("select admin_extender_suscripcion($1, 400, 'demasiado')", [b.orgId])))).toMatch(/entre 1 y 365/);
  });

  it("suspender bloquea (estado suspendida con motivo) y reactivar lo devuelve", async () => {
    await como(admin, () => db.query("select admin_suspender($1, true, 'Contracargo del pago')", [b.orgId]));
    expect(await sus(b.orgId)).toMatchObject({ estado: "suspendida" });
    expect((await q<{ motivo_suspension: string }>("select motivo_suspension from suscripciones where organizacion_id=$1", [b.orgId]))[0]!.motivo_suspension).toBe("Contracargo del pago");
    await como(admin, () => db.query("select admin_suspender($1, false, 'Se resolvió con el banco')", [b.orgId]));
    expect((await sus(b.orgId)).estado).toBe("activa");
  });

  it("un pago manual queda aprobado con referencia MAN- y activa el plan", async () => {
    const ref = await como(admin, async () => (await q<{ r: string }>("select admin_registrar_pago_manual($1, 'negocio', 3, 239700, 'Transferencia Bancolombia 12/11') r", [a.orgId]))[0]!.r);
    expect(ref).toMatch(/^MAN-[0-9A-F]{16}$/);
    expect(await sus(a.orgId)).toMatchObject({ estado: "activa", plan: "negocio", dias_restantes: 14 + 90 });
    expect((await q<{ estado: string; proveedor: string }>("select estado, proveedor from pagos_suscripcion where referencia=$1", [ref]))[0]).toEqual({ estado: "aprobado", proveedor: "manual" });
    const m = await como(admin, async () => (await q<{ m: Record<string, number> }>("select admin_metricas() m"))[0]!.m);
    expect(m).toMatchObject({ activos: 2, mrr: 79900 + 149900 });
  });

  it("todo queda en la bitácora con quién, qué y por qué", async () => {
    const d = await como(admin, async () => (await q<{ d: { acciones: { accion: string; motivo: string }[] } }>("select admin_detalle_negocio($1) d", [b.orgId]))[0]!.d);
    expect(d.acciones.map((x) => x.accion)).toEqual(["reactivar", "suspender", "extender", "cambiar_plan"]);
    expect(d.acciones[2]!.motivo).toBe("Compensación por caída");
    expect((await q<{ n: string }>("select count(*)::text n from admin_acciones where usuario_id=$1", [admin]))[0]!.n).toBe("5");
  });
});
