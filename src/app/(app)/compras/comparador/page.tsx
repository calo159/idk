import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP } from "@/lib/dinero";
import { formatoFecha } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { zUuid } from "@/lib/validaciones/comunes";

export const metadata: Metadata = { title: "Comparador de proveedores" };

export default async function Pagina({ searchParams }: { searchParams: Promise<{ q?: string; producto?: string }> }) {
  const ctx = await requerirContexto();
  if (ctx.rol === "vendedor" || ctx.rol === "ruta") {
    return <p className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">El comparador es para quien compra mercancía.</p>;
  }
  const { q = "", producto } = await searchParams;
  const supabase = await crearClienteServidor();
  const termino = q.replace(/[%_,()*\\]/g, " ").trim();
  const idProducto = producto && zUuid.safeParse(producto).success ? producto : null;

  const [{ data: encontrados }, { data: comparacion }, { data: alzas }, { data: elegido }] = await Promise.all([
    termino
      ? supabase.from("productos").select("id, nombre").eq("organizacion_id", ctx.organizacionId).ilike("nombre", `%${termino}%`).limit(8)
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    idProducto ? supabase.rpc("comparar_proveedores", { p_org: ctx.organizacionId, p_producto: idProducto }) : Promise.resolve({ data: null }),
    supabase.rpc("alzas_de_precio", { p_org: ctx.organizacionId, p_dias: 60, p_umbral: 5 }),
    idProducto ? supabase.from("productos").select("nombre").eq("id", idProducto).eq("organizacion_id", ctx.organizacionId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  return (
    <section className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <Link href="/compras" className="text-sm text-muted-foreground underline">← Compras</Link>
      <h1 className="text-xl font-semibold">Comparador de proveedores</h1>
      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={q} aria-label="Buscar producto" placeholder="¿De qué producto quieres comparar precios?" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm" />
        <button className="h-11 rounded-lg border px-4 text-sm">Buscar</button>
      </form>
      {(encontrados ?? []).length > 0 && !idProducto ? (
        <ul className="divide-y rounded-xl border text-sm">
          {(encontrados ?? []).map((p) => (
            <li key={p.id}><Link href={`/compras/comparador?producto=${p.id}`} className="block px-4 py-2.5 hover:bg-muted/50">{p.nombre}</Link></li>
          ))}
        </ul>
      ) : null}

      {idProducto ? (
        <div className="space-y-2">
          <h2 className="font-medium">{elegido?.nombre ?? "Producto"}</h2>
          {(comparacion ?? []).length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aún no hay compras de este producto a ningún proveedor.</p>
          ) : (
            <ul className="divide-y rounded-xl border text-sm">
              {(comparacion ?? []).map((c, i) => (
                <li key={c.proveedor_id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.proveedor}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatoFecha(c.fecha)} · {Number(c.compras)} compra(s) · rango {formatoCOP(c.costo_minimo)} – {formatoCOP(c.costo_maximo)}
                    </span>
                  </span>
                  {i === 0 ? <Badge>Más barato</Badge> : <span className="text-xs text-destructive">+{Number(c.pct_vs_mejor)} %</span>}
                  <span className="font-medium tabular-nums">{formatoCOP(c.ultimo_costo)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="font-medium">Subidas de precio (últimos 60 días)</h2>
        <ul className="divide-y rounded-xl border text-sm">
          {(alzas ?? []).map((a) => (
            <li key={`${a.producto_id}-${a.proveedor_id}`} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{a.producto}</span>
                <span className="block text-xs text-muted-foreground">{a.proveedor} · {formatoFecha(a.fecha)}</span>
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{formatoCOP(a.costo_anterior)} → {formatoCOP(a.costo_nuevo)}</span>
              <Badge variant="destructive">+{Number(a.pct)} %</Badge>
            </li>
          ))}
          {(alzas ?? []).length === 0 ? <li className="px-4 py-6 text-center text-muted-foreground">Sin subidas importantes. ✔</li> : null}
        </ul>
      </div>
    </section>
  );
}
