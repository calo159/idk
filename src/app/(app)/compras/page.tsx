import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP } from "@/lib/dinero";
import { ETIQUETA_ESTADO } from "@/lib/etiquetas";
import { formatoFecha } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Compras" };


export default async function Pagina() {
  const ctx = await requerirContexto();
  const supabase = await crearClienteServidor();
  const { data: compras } = await supabase
    .from("compras")
    .select("id, numero_factura, fecha, estado, total, proveedores(nombre)")
    .eq("organizacion_id", ctx.organizacionId)
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(100);

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Compras</h1>
        {puede(ctx.rol, "compras.confirmar") ? (
          <Link href="/compras/nueva" className={cn(buttonVariants(), "h-10")}>
            <Plus className="size-4" aria-hidden /> Nueva
          </Link>
        ) : null}
      </header>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/compras/ordenes" className="rounded-full border px-3 py-1.5 hover:bg-muted">Órdenes de compra</Link>
        <Link href="/compras/pagos" className="rounded-full border px-3 py-1.5 hover:bg-muted">Cuentas por pagar</Link>
        <Link href="/compras/comparador" className="rounded-full border px-3 py-1.5 hover:bg-muted">Comparar proveedores</Link>
        <Link href="/proveedores" className="rounded-full border px-3 py-1.5 hover:bg-muted">Proveedores</Link>
      </div>
      {(compras ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aún no has registrado compras.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {(compras ?? []).map((c) => (
            <li key={c.id}>
              <Link href={`/compras/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.proveedores?.nombre ?? "Sin proveedor"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatoFecha(c.fecha)}
                    {c.numero_factura ? ` · Fact. ${c.numero_factura}` : ""}
                  </p>
                </div>
                {c.estado !== "confirmado" ? (
                  <Badge variant={c.estado === "anulado" ? "destructive" : "secondary"}>
                    {ETIQUETA_ESTADO[c.estado] ?? c.estado}
                  </Badge>
                ) : null}
                <span className="text-sm font-medium tabular-nums">{formatoCOP(c.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
