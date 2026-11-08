import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sumar } from "@/lib/dinero";
import type { Database } from "@/lib/supabase/tipos";
import type { RepoAsistente } from "./herramientas";

const limpiar = (t: string) => t.replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

/**
 * Repositorio real: usa el cliente de la SESIÓN del usuario (no el service role). Las funciones de reportes validan el rol
 * (dueño, admin o contador) y las tablas siguen protegidas por RLS, así que el asistente nunca ve más que la persona.
 */
export function crearRepoAsistente(supabase: SupabaseClient<Database>, org: string): RepoAsistente {
  const leer = <T>(r: { data: T | null; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data ?? ([] as unknown as T);
  };
  return {
    async ventasDiarias(desde, hasta) {
      const d = leer(await supabase.rpc("reporte_ventas_diarias", { p_org: org, p_desde: desde, p_hasta: hasta }));
      return d.map((x) => ({ dia: x.dia, ventas: Number(x.ventas), total: Number(x.total), costo: Number(x.costo), utilidad: Number(x.utilidad) }));
    },
    async ventasProducto(desde, hasta) {
      const d = leer(await supabase.rpc("reporte_ventas_por_producto", { p_org: org, p_desde: desde, p_hasta: hasta, p_limite: 200 }));
      return d.map((x) => ({ nombre: x.nombre, cantidad: Number(x.cantidad), ingreso: Number(x.ingreso), utilidad: Number(x.utilidad) }));
    },
    async ventasMetodo(desde, hasta) {
      const d = leer(await supabase.rpc("reporte_ventas_por_metodo", { p_org: org, p_desde: desde, p_hasta: hasta }));
      return d.map((x) => ({ metodo: x.metodo, pagos: Number(x.pagos), total: Number(x.total) }));
    },
    async ventasVendedor(desde, hasta) {
      const d = leer(await supabase.rpc("reporte_ventas_por_vendedor", { p_org: org, p_desde: desde, p_hasta: hasta }));
      return d.map((x) => ({ nombre: x.nombre, ventas: Number(x.ventas), total: Number(x.total), utilidad: Number(x.utilidad) }));
    },
    async buscarProductos(texto) {
      const t = limpiar(texto);
      if (t.length < 2) return [];
      const d = leer(
        await supabase.from("productos").select("nombre, unidad_base, precio_venta, existencias(cantidad)").eq("organizacion_id", org).eq("activo", true).ilike("nombre", `%${t}%`).order("nombre").limit(20),
      );
      return d.map((p) => ({ nombre: p.nombre, unidad: p.unidad_base, stock: Number(sumar(...p.existencias.map((e) => e.cantidad))), precio: Number(p.precio_venta) }));
    },
    async deudas(cliente) {
      const d = leer(await supabase.rpc("cartera_clientes", { p_org: org }));
      const t = cliente ? limpiar(cliente).toLowerCase() : "";
      return d
        .filter((c) => !t || c.nombre.toLowerCase().includes(t))
        .map((c) => ({ nombre: c.nombre, saldo: Number(c.saldo), vencido: Number(c.vencido), dias_mora: c.dias_mora }));
    },
    async plataDormida(dias) {
      const d = leer(await supabase.rpc("reporte_plata_dormida", { p_org: org, p_dias: dias }));
      return d.map((x) => ({ nombre: x.nombre, cantidad: Number(x.cantidad), valor: Number(x.valor), dias_sin_vender: x.dias_sin_vender }));
    },
  };
}
