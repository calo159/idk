import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requerirContexto } from "@/lib/auth/contexto";
import { ESTADOS_ORDEN } from "@/lib/etiquetas";
import { formatoFecha } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Órdenes de compra" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("ordenes_compra")
    .select("id, numero, estado, fecha_esperada, proveedores(nombre), ordenes_compra_detalle(cantidad_pedida, costo_unitario)")
    .eq("organizacion_id", ctx.organizacionId)
    .order("creado_en", { ascending: false })
    .limit(50);
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/compras" className="text-sm text-muted-foreground underline">← Compras</Link>
          <h1 className="text-xl font-semibold">Órdenes de compra</h1>
        </div>
        {puede(ctx.rol, "compras.confirmar") ? <Link href="/compras/ordenes/nueva" className={cn(buttonVariants(), "h-10")}>Nueva</Link> : null}
      </div>
      <ul className="divide-y rounded-xl border text-sm">
        {(data ?? []).map((o) => (
          <li key={o.id}>
            <Link href={`/compras/ordenes/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">OC #{o.numero} · {o.proveedores?.nombre}</span>
                <span className="block text-xs text-muted-foreground">
                  {o.ordenes_compra_detalle.length} producto(s){o.fecha_esperada ? ` · llega ${formatoFecha(o.fecha_esperada)}` : ""}
                </span>
              </span>
              <Badge variant={o.estado === "cancelada" ? "destructive" : "secondary"}>{ESTADOS_ORDEN[o.estado]}</Badge>
            </Link>
          </li>
        ))}
        {(data ?? []).length === 0 ? <li className="px-4 py-8 text-center text-muted-foreground">Aún no hay órdenes de compra.</li> : null}
      </ul>
    </section>
  );
}
