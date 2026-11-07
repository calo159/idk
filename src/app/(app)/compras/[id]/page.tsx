import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCantidad, formatoCOP } from "@/lib/dinero";
import { ETIQUETA_ESTADO } from "@/lib/etiquetas";
import { formatoFecha } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { zUuid } from "@/lib/validaciones/comunes";
import { totalCompra } from "@/lib/validaciones/compras";
import { BotonConfirmarCompra, FormAnularCompra } from "./acciones-compra";

export const metadata: Metadata = { title: "Compra" };

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requerirContexto();
  const { id } = await params;
  if (!zUuid.safeParse(id).success) notFound();
  const supabase = await crearClienteServidor();
  const [{ data: compra }, { data: lineas }] = await Promise.all([
    supabase
      .from("compras")
      .select("id, numero_factura, fecha, estado, total, motivo_anulacion, proveedores(nombre), bodegas(nombre)")
      .eq("id", id)
      .eq("organizacion_id", ctx.organizacionId)
      .maybeSingle(),
    supabase
      .from("compras_detalle")
      .select("id, cantidad, costo_unitario, subtotal, productos(nombre, unidad_base), presentaciones(nombre)")
      .eq("compra_id", id),
  ]);
  if (!compra) notFound();
  const total = compra.estado === "borrador" ? totalCompra(lineas ?? []) : compra.total;

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href="/compras" className="text-sm text-muted-foreground underline">
        ← Compras
      </Link>
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{compra.proveedores?.nombre ?? "Sin proveedor"}</h1>
          <Badge variant={compra.estado === "anulado" ? "destructive" : "secondary"}>
            {ETIQUETA_ESTADO[compra.estado] ?? compra.estado}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatoFecha(compra.fecha)} · {compra.bodegas?.nombre}
          {compra.numero_factura ? ` · Factura ${compra.numero_factura}` : ""}
        </p>
        {compra.motivo_anulacion ? (
          <p className="text-sm text-destructive">Motivo de anulación: {compra.motivo_anulacion}</p>
        ) : null}
      </header>

      <ul className="divide-y rounded-xl border text-sm">
        {(lineas ?? []).map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{l.productos?.nombre}</span>
              <span className="block text-xs text-muted-foreground">
                {formatoCantidad(l.cantidad)} {l.presentaciones?.nombre ?? l.productos?.unidad_base} ×{" "}
                {formatoCOP(l.costo_unitario)}
              </span>
            </span>
            <span className="font-medium tabular-nums">{formatoCOP(l.subtotal)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between text-lg font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatoCOP(total)}</span>
      </div>

      {compra.estado === "borrador" && puede(ctx.rol, "compras.confirmar") ? (
        <BotonConfirmarCompra id={compra.id} />
      ) : null}
      {compra.estado === "confirmado" && puede(ctx.rol, "compras.anular") ? (
        <FormAnularCompra id={compra.id} />
      ) : null}
    </section>
  );
}
