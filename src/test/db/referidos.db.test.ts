/** Migración 0036: programa de referidos. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, agregarMiembro, comoUsuario, crearBd, crearNegocio, mensajeDeError } from "./bd";

let db: Bd;
const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const q = async <T extends object>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;
const servicio = async <T>(fn: () => Promise<T>) => { await db.exec("set role service_role"); try { return await fn(); } finally { await db.exec("reset role"); } };

const codigoDe = async (org: string) => (await q<{ c: string }>("select codigo_referido c from organizaciones where id=$1", [org]))[0]!.c;
const usar = (u: string, org: string, codigo: string) => como(u, async () => (await q<{ r: string }>("select aplicar_codigo_referido($1,$2) r", [org, codigo]))[0]!.r);
const dias = async (org: string) => (await q<{ d: number }>("select dias_restantes d from mi_suscripcion_interna($1)", [org]))[0]!.d;
/** El referido paga de verdad (por el procesador de pagos). */
async function pagar(u: string, org: string, monto?: number) {
  const p = await como(u, async () => (await q<{ referencia: string; monto: string }>("select * from iniciar_pago_suscripcion($1,'negocio',1)", [org]))[0]!);
  return servicio(async () => (await q<{ r: string }>("select aplicar_pago_suscripcion($1,'tx','aprobado',$2,'{}'::jsonb) r", [p.referencia, monto ?? Number(p.monto)]))[0]!.r);
}
const nuevo = async (n: string) => crearNegocio(db, n, `${n.toLowerCase().replace(/\W/g, "")}@x.co`);

beforeAll(async () => { db = await crearBd(); });
afterAll(async () => db.close());

describe("códigos", () => {
  it("cada negocio nace con su código único SURT-XXXXXX (sin letras confusas)", async () => {
    const a = await nuevo("Alfa");
    const b = await nuevo("Beta");
    const [ca, cb] = [await codigoDe(a.orgId), await codigoDe(b.orgId)];
    expect(ca).toMatch(/^SURT-[A-HJ-NP-Z2-9]{6}$/);
    expect(cb).toMatch(/^SURT-[A-HJ-NP-Z2-9]{6}$/);
    expect(ca).not.toBe(cb);
  });
});

describe("aplicar_codigo_referido", () => {
  it("registra la recomendación (mayúsculas/minúsculas y espacios no importan) y solo una vez", async () => {
    const a = await nuevo("Gamma");
    const b = await nuevo("Delta");
    expect(await usar(b.duenoId, b.orgId, `  ${(await codigoDe(a.orgId)).toLowerCase()} `)).toBe("ok");
    expect(await usar(b.duenoId, b.orgId, await codigoDe(a.orgId))).toBe("ya_usado");
    expect((await q<{ estado: string }>("select estado from referidos where referido_org=$1", [b.orgId]))[0]!.estado).toBe("registrado");
  });

  it("código inventado, uno mismo y negocios de las mismas personas no valen", async () => {
    const a = await nuevo("Epsilon");
    const b = await nuevo("Zeta");
    expect(await usar(b.duenoId, b.orgId, "SURT-XXXXXX")).toBe("codigo_invalido");
    expect(await usar(a.duenoId, a.orgId, await codigoDe(a.orgId))).toBe("no_permitido");
    // El dueño de «Epsilon» también es miembro de «Zeta»: no se pueden referir entre sí.
    await db.query("insert into miembros (organizacion_id, usuario_id, rol, nombre) values ($1,$2,'admin','Mismo')", [b.orgId, a.duenoId]);
    expect(await usar(b.duenoId, b.orgId, await codigoDe(a.orgId))).toBe("no_permitido");
  });

  it("solo el dueño; no después de 30 días ni después de haber pagado", async () => {
    const a = await nuevo("Eta");
    const b = await nuevo("Theta");
    const v = await agregarMiembro(db, b.orgId, "v@theta.co", "vendedor");
    const codigoA = await codigoDe(a.orgId);
    expect(await mensajeDeError(() => usar(v, b.orgId, codigoA))).toMatch(/Solo el dueño/);
    await db.query("update organizaciones set creado_en = now() - interval '31 days' where id=$1", [b.orgId]);
    expect(await usar(b.duenoId, b.orgId, await codigoDe(a.orgId))).toBe("vencido");
    const c = await nuevo("Iota");
    await pagar(c.duenoId, c.orgId);
    expect(await usar(c.duenoId, c.orgId, await codigoDe(a.orgId))).toBe("ya_pago");
  });
});

describe("recompensa por el primer pago", () => {
  it("registrarse NO premia; el primer pago suma 30 días a los dos y avisa al referidor", async () => {
    const a = await nuevo("Kappa");
    const b = await nuevo("Lambda");
    await usar(b.duenoId, b.orgId, await codigoDe(a.orgId));
    expect(await dias(a.orgId)).toBe(14);
    expect(await dias(b.orgId)).toBe(14);

    expect(await pagar(b.duenoId, b.orgId)).toBe("aplicado");
    expect(await dias(b.orgId)).toBe(14 + 30 + 30); // prueba + mes pagado + regalo
    expect(await dias(a.orgId)).toBe(14 + 30);
    const r = (await q<{ estado: string; dias_referidor: number; dias_referido: number }>("select estado, dias_referidor, dias_referido from referidos where referido_org=$1", [b.orgId]))[0]!;
    expect(r).toEqual({ estado: "convertido", dias_referidor: 30, dias_referido: 30 });
    expect((await q<{ mensaje: string }>("select mensaje from alertas where organizacion_id=$1 and tipo='referido_convertido'", [a.orgId]))[0]!.mensaje).toMatch(/Lambda pagó su suscripción.*30 días gratis/);
  });

  it("el segundo pago del referido no vuelve a premiar", async () => {
    const a = await nuevo("Mu");
    const b = await nuevo("Nu");
    await usar(b.duenoId, b.orgId, await codigoDe(a.orgId));
    await pagar(b.duenoId, b.orgId);
    const antes = await dias(a.orgId);
    await pagar(b.duenoId, b.orgId);
    expect(await dias(a.orgId)).toBe(antes);
  });

  it("reintentar el webhook del mismo pago no premia dos veces", async () => {
    const a = await nuevo("Xi");
    const b = await nuevo("Omicron");
    await usar(b.duenoId, b.orgId, await codigoDe(a.orgId));
    const p = await como(b.duenoId, async () => (await q<{ referencia: string; monto: string }>("select * from iniciar_pago_suscripcion($1,'negocio',1)", [b.orgId]))[0]!);
    const aplicar = () => servicio(async () => (await q<{ r: string }>("select aplicar_pago_suscripcion($1,'tx','aprobado',$2,'{}'::jsonb) r", [p.referencia, Number(p.monto)]))[0]!.r);
    expect(await aplicar()).toBe("aplicado");
    const dA = await dias(a.orgId);
    expect(await aplicar()).toBe("ya_aplicado");
    expect(await dias(a.orgId)).toBe(dA);
  });

  it("un pago con monto distinto (en revisión) no convierte la recomendación", async () => {
    const a = await nuevo("Pi");
    const b = await nuevo("Rho");
    await usar(b.duenoId, b.orgId, await codigoDe(a.orgId));
    expect(await pagar(b.duenoId, b.orgId, 1000)).toBe("monto_distinto");
    expect((await q<{ estado: string }>("select estado from referidos where referido_org=$1", [b.orgId]))[0]!.estado).toBe("registrado");
  });

  it("tope: un negocio gana máximo 12 meses gratis al año; el referido igual recibe su regalo", async () => {
    const a = await nuevo("Sigma");
    for (let i = 0; i < 12; i++) {
      const b = await nuevo(`Hijo${i}`);
      await usar(b.duenoId, b.orgId, await codigoDe(a.orgId));
      await pagar(b.duenoId, b.orgId);
    }
    const antes = await dias(a.orgId);
    expect(antes).toBe(14 + 360);
    const extra = await nuevo("HijoExtra");
    await usar(extra.duenoId, extra.orgId, await codigoDe(a.orgId));
    await pagar(extra.duenoId, extra.orgId);
    expect(await dias(a.orgId)).toBe(antes); // el referidor ya llegó al tope
    expect(await dias(extra.orgId)).toBe(14 + 30 + 30); // pero el referido sí recibe su mes
  });
});

describe("mis_referidos y privacidad", () => {
  it("el referidor ve a quién recomendó y su estado; el referido no ve a nadie más", async () => {
    const a = await nuevo("Tau");
    const b = await nuevo("Upsilon");
    await usar(b.duenoId, b.orgId, await codigoDe(a.orgId));
    const lista = await como(a.duenoId, () => q<{ negocio: string; estado: string }>("select negocio, estado from mis_referidos($1)", [a.orgId]));
    expect(lista).toEqual([{ negocio: "Upsilon", estado: "registrado" }]);
    expect(await como(b.duenoId, async () => (await q<{ r: unknown }>("select * from referidos")).length)).toBe(1); // solo su propia fila
    expect(await mensajeDeError(() => como(b.duenoId, () => db.query("select * from mis_referidos($1)", [a.orgId])))).toMatch(/Sin permiso/);
  });
  it("no se puede escribir en referidos desde la API", async () => {
    const a = await nuevo("Fi");
    const b = await nuevo("Ji");
    expect(await mensajeDeError(() => como(a.duenoId, () => db.query("insert into referidos (referidor_org, referido_org) values ($1,$2)", [a.orgId, b.orgId])))).toMatch(/row-level security/i);
  });
});
