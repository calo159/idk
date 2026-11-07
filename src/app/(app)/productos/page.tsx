import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP } from "@/lib/dinero";
import { puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cn } from "@/lib/utils";
import { FormCategoria } from "./formularios";
import { EscanerBusqueda } from "./escaner-busqueda";

export const metadata: Metadata = { title: "Productos" };

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string; inactivos?: string }>;
}) {
  const ctx = await requerirContexto();
  const { q = "", categoria = "", inactivos } = await searchParams;
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("productos")
    .select("id, nombre, sku, codigo_barras, precio_venta, unidad_base, activo, categorias(nombre)")
    .eq("organizacion_id", ctx.organizacionId)
    .order("nombre")
    .limit(200);
  if (!inactivos) consulta = consulta.eq("activo", true);
  if (categoria) consulta = consulta.eq("categoria_id", categoria);
  // Quita comodines y separadores de PostgREST para que la búsqueda no rompa el filtro.
  const termino = q.replace(/[%_,()*\\]/g, " ").trim();
  if (termino)
    consulta = consulta.or(
      `nombre.ilike.%${termino}%,sku.ilike.%${termino}%,codigo_barras.eq.${termino}`,
    );

  const [{ data: productos }, { data: categorias }] = await Promise.all([
    consulta,
    supabase.from("categorias").select("id, nombre").eq("organizacion_id", ctx.organizacionId).order("nombre"),
  ]);
  const puedeEditar = puedeEscribir(ctx.rol, "productos");

  return (
    <section className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Productos</h1>
        {puedeEditar ? (
          <Link href="/productos/nuevo" className={cn(buttonVariants(), "h-10")}>
            <Plus className="size-4" aria-hidden /> Nuevo
          </Link>
        ) : null}
      </header>

      <form className="flex flex-wrap gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, SKU o código"
          aria-label="Buscar productos"
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
        />
        <select
          name="categoria"
          defaultValue={categoria}
          aria-label="Categoría"
          className="h-11 rounded-lg border border-input bg-background px-2 text-sm"
        >
          <option value="">Todas</option>
          {(categorias ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="inactivos" value="1" defaultChecked={!!inactivos} /> Inactivos
        </label>
        <button type="submit" className={cn(buttonVariants({ variant: "outline" }), "h-11")}>
          Buscar
        </button>
        <EscanerBusqueda />
      </form>

      {(productos ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {termino || categoria
            ? "No hay productos con ese filtro."
            : "Aún no tienes productos. Crea el primero o impórtalos desde Excel."}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {(productos ?? []).map((p) => (
            <li key={p.id}>
              <Link href={`/productos/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.nombre}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[p.categorias?.nombre, p.sku, p.codigo_barras].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                {!p.activo ? <Badge variant="secondary">Inactivo</Badge> : null}
                <span className="text-sm font-medium tabular-nums">
                  {formatoCOP(p.precio_venta)}
                  <span className="text-xs font-normal text-muted-foreground"> /{p.unidad_base}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {puedeEditar ? (
        <div className="space-y-2 rounded-xl border p-4">
          <h2 className="text-sm font-medium">Categorías</h2>
          <FormCategoria />
        </div>
      ) : null}
    </section>
  );
}
