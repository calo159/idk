import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { paraBd, sumar } from "@/lib/dinero";
import { esquemaResumen } from "@/lib/resumen";
import type { Database } from "@/lib/supabase/tipos";
import type { RepoBot } from "./ejecutar";

const limpiar = (t: string) => t.replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
const numericoBd = (v: string) => v as unknown as number;

/** Implementación real del repositorio del bot (cliente con service role: TODA consulta filtra por organizacion_id). */
export function crearRepoBot(admin: SupabaseClient<Database>): RepoBot {
  return {
    async resumen(org, desde, hasta) {
      const { data, error } = await admin.rpc("resumen_periodo", { p_org: org, p_desde: desde, p_hasta: hasta });
      const r = esquemaResumen.safeParse(data);
      return error || !r.success ? null : r.data;
    },
    async buscarProductos(org, texto) {
      const t = limpiar(texto);
      if (t.length < 2) return [];
      const { data } = await admin
        .from("productos")
        .select("nombre, unidad_base, existencias(cantidad)")
        .eq("organizacion_id", org)
        .eq("activo", true)
        .ilike("nombre", `%${t}%`)
        .order("nombre")
        .limit(10);
      return (data ?? []).map((p) => ({ nombre: p.nombre, unidad: p.unidad_base, stock: Number(sumar(...p.existencias.map((e) => e.cantidad))) }));
    },
    async buscarClientes(org, texto) {
      const t = limpiar(texto);
      if (t.length < 2) return [];
      const { data } = await admin.from("clientes").select("nombre, saldo").eq("organizacion_id", org).ilike("nombre", `%${t}%`).order("nombre").limit(10);
      return (data ?? []).map((c) => ({ nombre: c.nombre, saldo: Number(c.saldo) }));
    },
    async topDeudores(org) {
      const { data } = await admin.from("clientes").select("nombre, saldo").eq("organizacion_id", org).gt("saldo", 0).order("saldo", { ascending: false }).limit(1000);
      const filas = data ?? [];
      const total = Number(sumar(...filas.map((c) => c.saldo)));
      return filas.slice(0, 5).map((c) => ({ nombre: c.nombre, saldo: Number(c.saldo), total }));
    },
    async guardarPendiente(telefono, org, usuario, accion) {
      const { error } = await admin.rpc("bot_guardar_pendiente", { p_telefono: telefono, p_org: org, p_usuario: usuario, p_accion: accion as never });
      if (error) throw new Error("No se pudo guardar la acción pendiente");
    },
    async tomarPendiente(telefono) {
      const { data } = await admin.rpc("bot_tomar_pendiente", { p_telefono: telefono });
      const p = data?.[0];
      return p ? { organizacion_id: p.organizacion_id, usuario_id: p.usuario_id, accion: p.accion } : null;
    },
    async registrarGasto(org, usuario, g) {
      const { error } = await admin.rpc("registrar_gasto_bot", {
        p_org: org,
        p_usuario: usuario,
        p_categoria: g.categoria,
        p_descripcion: g.descripcion,
        p_monto: numericoBd(paraBd(g.monto)),
        p_metodo: g.metodo as Database["public"]["Enums"]["metodo_pago"],
      });
      if (error) throw new Error("No se pudo registrar el gasto");
    },
  };
}
