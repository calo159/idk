import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductoSelector } from "@/components/selector-lineas";
import type { Database } from "@/lib/supabase/tipos";

/** Catálogo liviano (nombre, precio y presentaciones) para armar documentos: cotizaciones, separados. */
export async function cargarCatalogoSelector(supabase: SupabaseClient<Database>, org: string): Promise<ProductoSelector[]> {
  const { data } = await supabase
    .from("productos")
    .select("id, nombre, precio_venta, presentaciones(id, nombre, precio_venta)")
    .eq("organizacion_id", org)
    .eq("activo", true)
    .order("nombre")
    .limit(3000);
  return (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    precio: Number(p.precio_venta),
    presentaciones: p.presentaciones.map((x) => ({ id: x.id, nombre: x.nombre, precio: Number(x.precio_venta) })),
  }));
}
