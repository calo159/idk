import type { Metadata } from "next";
import Link from "next/link";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { PanelPrecios } from "./panel";

export const metadata: Metadata = { title: "Precios y márgenes" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin" && ctx.rol !== "contador") {
    return <p className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">Esta sección es para el dueño, los administradores y el contador.</p>;
  }
  const supabase = await crearClienteServidor();
  const [{ data }, { data: org }] = await Promise.all([
    supabase.rpc("precios_sugeridos", { p_org: ctx.organizacionId }),
    supabase.from("organizaciones").select("precios_automaticos").eq("id", ctx.organizacionId).maybeSingle(),
  ]);
  const filas = (data ?? []).map((p) => ({
    id: p.producto_id, nombre: p.producto, costo: Number(p.costo), precioActual: Number(p.precio_actual), margenObjetivo: Number(p.margen_objetivo),
    margenActual: p.margen_actual === null ? null : Number(p.margen_actual), sugerido: Number(p.precio_sugerido), unidades30d: Number(p.unidades_30d),
  }));
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href="/productos" className="text-sm text-muted-foreground underline">← Productos</Link>
      <h1 className="text-xl font-semibold">Precios y márgenes</h1>
      <p className="text-sm text-muted-foreground">El precio sugerido sale del costo y del margen que quieres ganar en cada producto. Define el margen objetivo al editar un producto.</p>
      {filas.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aún no hay productos con margen objetivo y costo conocido. Edita un producto, escribe su «Margen objetivo (%)» y compra mercancía para ver sugerencias.</p>
      ) : (
        <PanelPrecios filas={filas} automatico={org?.precios_automaticos ?? false} puedeCambiar={ctx.rol === "dueno" || ctx.rol === "admin"} />
      )}
    </section>
  );
}
