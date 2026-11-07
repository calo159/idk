import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCantidad, formatoCOP } from "@/lib/dinero";
import { ESTADOS_ORDEN } from "@/lib/etiquetas";
import { formatoFecha } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { zUuid } from "@/lib/validaciones/comunes";
import { totalOrden } from "@/lib/validaciones/ordenes";
import { PanelOrden } from "./recibir";

export const metadata: Metadata = { title: "Orden de compra" };

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requerirContexto();
  const { id } = await params;
  if (!zUuid.safeParse(id).success) notFound();
  const supabase = await crearClienteServidor();
  const [{ data: orden }, { data: lineas }, { data: compras }] = await Promise.all([
    supabase.from("ordenes_compra").select("id, numero, estado, fecha_esperada, nota, proveedores(nombre), bodegas(nombre)").eq("id", id).eq("organizacion_id", ctx.organizacionId).maybeSingle(),
    supabase.from("ordenes_compra_detalle").select("id, cantidad_pedida, cantidad_recibida, costo_unitario, productos(nombre)").eq("orden_id", id),
    supabase.from("compras").select("id, fecha, numero_factura, total, estado").eq("orden_compra_id", id).order("fecha"),
  ]);
  if (!orden) notFound();
  const detalle = (lineas ?? []).map((l) => ({
    detalleId: l.id, nombre: l.productos?.nombre ?? "", pedida: Number(l.cantidad_pedida), recibida: Number(l.cantidad_recibida), costo: Number(l.costo_unitario),
  }));
  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <Link href="/compras/ordenes" className="text-sm text-muted-foreground underline">← Órdenes de compra</Link>
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">OC #{orden.numero}</h1>
          <Badge variant={orden.estado === "cancelada" ? "destructive" : "secondary"}>{ESTADOS_ORDEN[orden.estado]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {orden.proveedores?.nombre} → {orden.bodegas?.nombre}
          {orden.fecha_esperada ? ` · llega ${formatoFecha(orden.fecha_esperada)}` : ""}
        </p>
        {orden.nota ? <p className="text-sm italic">{orden.nota}</p> : null}
      </header>
      <ul className="divide-y rounded-xl border text-sm">
        {detalle.map((l) => (
          <li key={l.detalleId} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate">{l.nombre}</span>
            <span className={`text-xs ${l.recibida >= l.pedida ? "text-primary" : "text-muted-foreground"}`}>{formatoCantidad(l.recibida)} / {formatoCantidad(l.pedida)}</span>
            <span className="tabular-nums">{formatoCOP(l.costo)}</span>
          </li>
        ))}
      </ul>
      <p className="text-right font-semibold">Total estimado: {formatoCOP(totalOrden(detalle.map((l) => ({ cantidad: l.pedida, costo: l.costo }))))}</p>
      <PanelOrden ordenId={orden.id} estado={orden.estado} lineas={detalle} puedeGestionar={puede(ctx.rol, "compras.confirmar")} />
      {(compras ?? []).length > 0 ? (
        <div className="space-y-2">
          <h2 className="font-medium">Recepciones</h2>
          <ul className="divide-y rounded-xl border text-sm">
            {(compras ?? []).map((c) => (
              <li key={c.id}>
                <Link href={`/compras/${c.id}`} className="flex justify-between px-4 py-2.5 hover:bg-muted/50">
                  <span>{formatoFecha(c.fecha)}{c.numero_factura ? ` · Fact. ${c.numero_factura}` : ""}</span>
                  <span className="tabular-nums">{formatoCOP(c.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
