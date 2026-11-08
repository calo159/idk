/**
 * Qué funciones de `public` puede llamar cada rol por la API (/rest/v1/rpc/...).
 * Nació de un hallazgo real: el asesor de seguridad de Supabase mostró 27 funciones SECURITY DEFINER abiertas a `anon`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Bd, crearBd } from "./bd";

let db: Bd;
beforeAll(async () => { db = await crearBd(); });
afterAll(async () => db.close());

const puede = async (rol: string, soloDefiner = false) =>
  (
    await db.query<{ nombre: string }>(
      `select p.proname as nombre from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f' ${soloDefiner ? "and p.prosecdef" : ""}
          and has_function_privilege($1, p.oid, 'execute') order by 1`,
      [rol],
    )
  ).rows.map((r) => r.nombre);

describe("lo que un visitante sin sesión (anon) puede llamar", () => {
  it("solo el catálogo público", async () => {
    expect(await puede("anon")).toEqual(["catalogo_productos", "catalogo_publico"]);
  });
});

describe("lo que un usuario con sesión (authenticated) NO debe poder llamar", () => {
  it("ni las funciones de trigger ni los ayudantes internos", async () => {
    const triggers = (
      await db.query<{ nombre: string }>(
        `select p.proname as nombre from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prorettype = 'trigger'::regtype`,
      )
    ).rows.map((r) => r.nombre);
    expect(triggers.length).toBeGreaterThan(10);
    const autenticado = new Set(await puede("authenticated"));
    for (const t of triggers) expect(autenticado.has(t), `trigger ${t}`).toBe(false);
    for (const interna of ["siguiente_consecutivo", "aplicar_plantilla_nicho", "crear_alerta_unica", "calcular_cartera", "calcular_metricas_salud", "construir_documento_factura"])
      expect(autenticado.has(interna), interna).toBe(false);
  });

  it("sí puede llamar lo que la app necesita (y lo que usan las políticas de seguridad)", async () => {
    const autenticado = new Set(await puede("authenticated"));
    for (const f of ["mis_organizaciones", "tiene_rol", "desde_funcion", "roles_escritura", "confirmar_venta", "crear_organizacion", "registrar_abono", "mi_suscripcion"])
      expect(autenticado.has(f), f).toBe(true);
  });
});

describe("las funciones que solo usa el servidor (service_role) no las llama nadie más", () => {
  it("el cliente con sesión no puede ejecutar las del webhook de pagos, la cola de facturas ni los resúmenes", async () => {
    const autenticado = new Set(await puede("authenticated"));
    for (const f of ["aplicar_pago_suscripcion", "facturas_pendientes_envio", "resultado_factura_electronica", "reclamar_eventos", "resumen_periodo", "fidelizacion_para_n8n"])
      expect(autenticado.has(f), f).toBe(false);
    const servicio = new Set(await puede("service_role"));
    for (const f of ["aplicar_pago_suscripcion", "facturas_pendientes_envio", "reclamar_eventos"]) expect(servicio.has(f), f).toBe(true);
  });
});

describe("search_path fijo en las funciones que lo necesitaban", () => {
  it("no queda ninguna de las 14 sin search_path", async () => {
    const r = await db.query<{ nombre: string }>(
      `select p.proname as nombre from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prokind = 'f'
          and p.proname in ('proteger_detalle','proteger_saldo_cliente','desde_funcion','proteger_documento','proteger_verificacion','roles_escritura','signo_movimiento','bloquear_cambios','redondeo_precio','dia_en_temporada','estado_de_suscripcion','generar_codigo_referido','asignar_codigo_referido','razones_de_metricas')
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    expect(r.rows).toEqual([]);
  });
});
