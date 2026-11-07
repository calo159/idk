/**
 * Datos de demo (tarea 1.16): se generan con las funciones reales del sistema, así que deben dejar
 * inventario, cartera y caja perfectamente consistentes. Aquí se comprueban esos invariantes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generarDemoSql } from "../../demo/generador";
import { type Bd, comoUsuario, crearBd } from "./bd";

let db: Bd;
let orgId: string;
let duenoId: string;
let resumen: Record<string, number>;
const HOY = "2026-11-07";

beforeAll(async () => {
  db = await crearBd();
  const g = generarDemoSql({ hoy: HOY, dias: 21 });
  resumen = g.resumen;
  await db.exec(g.sql);
  orgId = (await db.query<{ id: string }>("select id from organizaciones limit 1")).rows[0]!.id;
  duenoId = (await db.query<{ id: string }>("select id from auth.users where email = 'demo@surtix.co'")).rows[0]!.id;
}, 240_000);
afterAll(async () => db.close());

const uno = async <T extends object>(sql: string) => (await db.query<T>(sql, [])).rows[0]!;

describe("datos de demo", () => {
  it("es determinista: misma semilla, mismo SQL", () => {
    expect(generarDemoSql({ hoy: HOY, dias: 5 }).sql).toBe(generarDemoSql({ hoy: HOY, dias: 5 }).sql);
    expect(generarDemoSql({ hoy: HOY, dias: 5, semilla: 7 }).sql).not.toBe(generarDemoSql({ hoy: HOY, dias: 5 }).sql);
  });

  it("crea un negocio realista con catálogo, proveedores, clientes y ventas", async () => {
    expect(resumen.ventas).toBeGreaterThan(250);
    expect(resumen.compras).toBeGreaterThan(5);
    const c = await uno<{ p: string; pr: string; cl: string; v: string }>(
      `select (select count(*) from productos)::text p, (select count(*) from proveedores)::text pr,
              (select count(*) from clientes)::text cl, (select count(*) from ventas where estado='confirmado')::text v`,
    );
    expect(Number(c.p)).toBeGreaterThanOrEqual(70);
    expect(Number(c.pr)).toBe(6);
    expect(Number(c.cl)).toBe(25);
    expect(Number(c.v)).toBe(resumen.ventas);
  });

  it("las existencias nunca son negativas y coinciden con la suma de movimientos (kardex)", async () => {
    const neg = await uno<{ n: string }>("select count(*)::text n from existencias where cantidad < 0");
    expect(neg.n).toBe("0");
    const desfase = await uno<{ n: string }>(
      `select count(*)::text n from existencias e where e.cantidad <> coalesce((
         select sum(case when signo_movimiento(m.tipo) = 1 then m.cantidad else -m.cantidad end)
           from movimientos_inventario m where m.producto_id = e.producto_id and m.bodega_id = e.bodega_id), 0)`,
    );
    expect(desfase.n).toBe("0");
  });

  it("el saldo de cada cliente es la suma de lo fiado menos los abonos", async () => {
    const mal = await uno<{ n: string }>(
      `select count(*)::text n from clientes c where c.saldo <> (
         coalesce((select sum(pv.monto) from pagos_venta pv join ventas v on v.id = pv.venta_id
                    where v.cliente_id = c.id and v.estado = 'confirmado' and pv.metodo = 'credito'), 0)
         - coalesce((select sum(a.monto) from abonos_cliente a where a.cliente_id = c.id), 0))`,
    );
    expect(mal.n).toBe("0");
    const hay = await uno<{ n: string }>("select count(*)::text n from clientes where saldo > 0");
    expect(Number(hay.n)).toBeGreaterThan(0);
  });

  it("cada venta confirmada cuadra: pagos = total, y la utilidad es positiva", async () => {
    const mal = await uno<{ n: string }>(
      `select count(*)::text n from ventas v where v.estado = 'confirmado'
         and v.total <> (select sum(monto) from pagos_venta where venta_id = v.id)`,
    );
    expect(mal.n).toBe("0");
    const u = await uno<{ t: string; c: string }>(
      "select sum(total)::text t, sum(costo_total)::text c from ventas where estado = 'confirmado'",
    );
    expect(Number(u.t)).toBeGreaterThan(Number(u.c));
    const margen = (Number(u.t) - Number(u.c)) / Number(u.t);
    expect(margen).toBeGreaterThan(0.15);
    expect(margen).toBeLessThan(0.45);
  });

  it("la caja: turnos cerrados con diferencias plantadas y el de hoy abierto", async () => {
    const abiertos = await uno<{ n: string }>("select count(*)::text n from turnos_caja where estado = 'abierto'");
    expect(abiertos.n).toBe("1");
    const dif = await uno<{ cuadran: string; faltantes: string }>(
      `select count(*) filter (where diferencia = 0)::text cuadran, count(*) filter (where diferencia <> 0)::text faltantes
         from turnos_caja where estado = 'cerrado'`,
    );
    expect(Number(dif.cuadran)).toBeGreaterThan(10);
    expect(Number(dif.faltantes)).toBeGreaterThanOrEqual(2);
  });

  it("incluye casos de control para mostrar: venta anulada, cambios de precio y comprobantes sospechosos", async () => {
    const anuladas = await uno<{ n: string }>("select count(*)::text n from ventas where estado = 'anulado'");
    expect(anuladas.n).toBe("1");
    const precio = await uno<{ n: string }>("select count(*)::text n from auditoria where accion = 'precio_modificado'");
    expect(Number(precio.n)).toBeGreaterThan(0);
    const alertas = await uno<{ n: string }>("select count(*)::text n from alertas where tipo = 'comprobante_sospechoso'");
    expect(Number(alertas.n)).toBeGreaterThanOrEqual(1);
    const sosp = await uno<{ n: string }>("select count(*)::text n from pagos_venta where verificacion = 'sospechoso'");
    expect(Number(sosp.n)).toBeGreaterThanOrEqual(1);
  });

  it("las fechas son reales: ventas y movimientos repartidos en los 21 días", async () => {
    const r = await uno<{ dias: string; desde: string }>(
      `select count(distinct (creado_en at time zone 'America/Bogota')::date)::text dias,
              min((creado_en at time zone 'America/Bogota')::date)::text desde from ventas`,
    );
    expect(Number(r.dias)).toBeGreaterThanOrEqual(19);
    expect(r.desde).toBe("2026-10-18");
    const mov = await uno<{ n: string }>(
      "select count(distinct (creado_en at time zone 'America/Bogota')::date)::text n from movimientos_inventario",
    );
    expect(Number(mov.n)).toBeGreaterThanOrEqual(19);
  });

  it("no deja eventos pendientes para n8n", async () => {
    const e = await uno<{ n: string }>("select count(*)::text n from eventos_outbox");
    expect(e.n).toBe("0");
  });

  it("los reportes funcionan sobre la demo", async () => {
    const filas = await comoUsuario(db, duenoId, async () =>
      (await db.query<{ ventas: string }>(
        "select ventas::text from reporte_ventas_diarias($1, '2026-10-18', '2026-11-07')",
        [orgId],
      )).rows,
    );
    expect(filas).toHaveLength(21);
    expect(filas.reduce((s, f) => s + Number(f.ventas), 0)).toBe(resumen.ventas);
  });
});
