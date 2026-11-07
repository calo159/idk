import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCantidad } from "@/lib/dinero";
import { formatoFechaHora } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cn } from "@/lib/utils";
import { BotonAnularTraslado } from "./anular";

export const metadata: Metadata = { title: "Traslados" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  const supabase = await crearClienteServidor();
  const { data: traslados } = await supabase
    .from("traslados")
    .select("id, numero, estado, nota, creado_en, origen:bodegas!traslados_bodega_origen_id_fkey(nombre), destino:bodegas!traslados_bodega_destino_id_fkey(nombre), traslados_detalle(cantidad, productos(nombre))")
    .eq("organizacion_id", ctx.organizacionId)
    .order("creado_en", { ascending: false })
    .limit(50);

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/inventario" className="text-sm text-muted-foreground underline">← Inventario</Link>
          <h1 className="text-xl font-semibold">Traslados entre bodegas</h1>
        </div>
        {puede(ctx.rol, "inventario.ajustar") ? (
          <Link href="/inventario/traslados/nuevo" className={cn(buttonVariants(), "h-10")}>Nuevo</Link>
        ) : null}
      </div>
      {(traslados ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aún no hay traslados.</p>
      ) : (
        <ul className="space-y-3">
          {(traslados ?? []).map((t) => (
            <li key={t.id} className="space-y-1.5 rounded-xl border p-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">#{t.numero} · {t.origen?.nombre} → {t.destino?.nombre}</span>
                {t.estado === "anulado" ? <Badge variant="destructive">Anulado</Badge> : null}
                <span className="ml-auto text-xs text-muted-foreground">{formatoFechaHora(t.creado_en)}</span>
              </div>
              <p className="text-muted-foreground">
                {t.traslados_detalle.map((d) => `${formatoCantidad(d.cantidad)} × ${d.productos?.nombre}`).join(" · ")}
              </p>
              {t.nota ? <p className="text-xs italic">{t.nota}</p> : null}
              {t.estado === "completado" && puede(ctx.rol, "ventas.anular") ? <BotonAnularTraslado id={t.id} /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
