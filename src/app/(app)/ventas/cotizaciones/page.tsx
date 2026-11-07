import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP, subtotalLinea, sumar } from "@/lib/dinero";
import { formatoFecha, hoyBogota } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cn } from "@/lib/utils";
import { textoCotizacion } from "@/lib/validaciones/ventas-extra";
import { BotonCancelarCotizacion } from "./cancelar";

export const metadata: Metadata = { title: "Cotizaciones" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("cotizaciones")
    .select("id, numero, estado, vigencia_hasta, creado_en, clientes(nombre, telefono), cotizaciones_detalle(cantidad, precio_unitario, descuento, productos(nombre))")
    .eq("organizacion_id", ctx.organizacionId)
    .order("creado_en", { ascending: false })
    .limit(50);
  const hoy = hoyBogota();
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/ventas/historial" className="text-sm text-muted-foreground underline">← Ventas</Link>
          <h1 className="text-xl font-semibold">Cotizaciones</h1>
        </div>
        {puede(ctx.rol, "ventas.confirmar") ? <Link href="/ventas/cotizaciones/nueva" className={cn(buttonVariants(), "h-10")}>Nueva</Link> : null}
      </div>
      <ul className="space-y-3">
        {(data ?? []).map((c) => {
          const lineas = c.cotizaciones_detalle.map((d) => ({ nombre: d.productos?.nombre ?? "", cantidad: Number(d.cantidad), sub: subtotalLinea(d.cantidad, d.precio_unitario, d.descuento) }));
          const total = sumar(...lineas.map((l) => l.sub));
          const vencida = c.estado === "vigente" && c.vigencia_hasta < hoy;
          const texto = textoCotizacion({ negocio: ctx.negocio, numero: Number(c.numero), vigencia: formatoFecha(c.vigencia_hasta), total: formatoCOP(total), lineas: lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, subtotal: formatoCOP(l.sub) })) });
          const tel = c.clientes?.telefono ? `57${c.clientes.telefono}` : "";
          return (
            <li key={c.id} className="space-y-2 rounded-xl border p-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">#{c.numero} · {c.clientes?.nombre ?? "Sin cliente"}</span>
                {c.estado === "aceptada" ? <Badge>Vendida</Badge> : c.estado === "cancelada" ? <Badge variant="destructive">Cancelada</Badge> : vencida ? <Badge variant="secondary">Vencida</Badge> : <Badge variant="secondary">Vigente</Badge>}
                <span className="font-medium tabular-nums">{formatoCOP(total)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{lineas.length} producto(s) · válida hasta {formatoFecha(c.vigencia_hasta)}</p>
              {c.estado === "vigente" ? (
                <div className="flex flex-wrap gap-3 text-xs">
                  {puede(ctx.rol, "ventas.confirmar") && !vencida ? <Link className="text-primary underline" href={`/ventas/pos?cotizacion=${c.id}`}>Vender</Link> : null}
                  <a className="text-primary underline" href={`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>
                  {puede(ctx.rol, "ventas.confirmar") ? <BotonCancelarCotizacion id={c.id} /> : null}
                </div>
              ) : null}
            </li>
          );
        })}
        {(data ?? []).length === 0 ? <li className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aún no hay cotizaciones.</li> : null}
      </ul>
    </section>
  );
}
