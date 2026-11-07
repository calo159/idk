import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { cantidad, formatoCantidad, formatoCOP, sumar } from "@/lib/dinero";
import { estadoStock, valorInventario } from "@/lib/inventario";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Inventario" };

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filtro?: string }>;
}) {
  const ctx = await requerirContexto();
  const { q = "", filtro = "" } = await searchParams;
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("productos")
    .select(
      "id, nombre, unidad_base, stock_minimo, maneja_inventario, existencias(cantidad, costo_promedio)",
    )
    .eq("organizacion_id", ctx.organizacionId)
    .eq("activo", true)
    .eq("maneja_inventario", true)
    .order("nombre")
    .limit(500);
  const termino = q.replace(/[%_,()*\\]/g, " ").trim();
  if (termino) consulta = consulta.ilike("nombre", `%${termino}%`);
  const { data } = await consulta;

  const filas = (data ?? []).map((p) => {
    const total = sumar(...p.existencias.map((e) => e.cantidad));
    return { ...p, total, estado: estadoStock(total, p.stock_minimo, p.maneja_inventario) };
  });
  const visibles = filas.filter((f) =>
    filtro === "bajo" ? f.estado === "bajo" || f.estado === "agotado" : true,
  );
  const valor = valorInventario(filas.flatMap((f) => f.existencias));
  const nBajo = filas.filter((f) => f.estado === "bajo" || f.estado === "agotado").length;

  return (
    <section className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Inventario</h1>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/inventario/traslados" className="rounded-full border px-3 py-1.5 hover:bg-muted">Traslados</Link>
        <Link href="/inventario/conteos" className="rounded-full border px-3 py-1.5 hover:bg-muted">Conteos físicos</Link>
        <Link href="/inventario/vencimientos" className="rounded-full border px-3 py-1.5 hover:bg-muted">Vencimientos</Link>
        <Link href="/inventario/seriales" className="rounded-full border px-3 py-1.5 hover:bg-muted">Seriales</Link>
        <Link href="/reportes/inventario" className="rounded-full border px-3 py-1.5 hover:bg-muted">Reportes</Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Valor del inventario (a costo)</p>
          <p className="text-lg font-semibold tabular-nums">{formatoCOP(valor)}</p>
        </div>
        <Link href="/inventario?filtro=bajo" className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Por reponer</p>
          <p className="text-lg font-semibold tabular-nums">{nBajo}</p>
        </Link>
      </div>
      <form className="flex gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar producto"
          aria-label="Buscar producto"
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
        />
        <select
          name="filtro"
          defaultValue={filtro}
          aria-label="Filtro"
          className="h-11 rounded-lg border border-input bg-background px-2 text-sm"
        >
          <option value="">Todos</option>
          <option value="bajo">Bajo o agotado</option>
        </select>
        <button className="h-11 rounded-lg border px-3 text-sm">Ver</button>
      </form>
      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay productos para mostrar.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {visibles.map((p) => (
            <li key={p.id}>
              <Link
                href={`/inventario/${p.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{p.nombre}</span>
                {p.estado === "agotado" ? <Badge variant="destructive">Agotado</Badge> : null}
                {p.estado === "bajo" ? <Badge variant="secondary">Bajo</Badge> : null}
                <span className="text-sm tabular-nums">
                  {formatoCantidad(cantidad(p.total))} {p.unidad_base}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
