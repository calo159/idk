import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCantidad, formatoCOP } from "@/lib/dinero";
import { formatoFechaHora } from "@/lib/fechas";
import { ETIQUETA_MOVIMIENTO } from "@/lib/inventario";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { zUuid } from "@/lib/validaciones/comunes";
import { FormAjuste } from "../formulario-ajuste";

export const metadata: Metadata = { title: "Kardex" };

const SALIDAS = new Set([
  "venta",
  "ajuste_salida",
  "traslado_salida",
  "devolucion_proveedor",
  "anulacion_salida",
]);

export default async function Pagina({ params }: { params: Promise<{ productoId: string }> }) {
  const ctx = await requerirContexto();
  const { productoId } = await params;
  if (!zUuid.safeParse(productoId).success) notFound();
  const supabase = await crearClienteServidor();

  const [{ data: producto }, { data: bodegas }, { data: existencias }, { data: movs }] =
    await Promise.all([
      supabase
        .from("productos")
        .select("id, nombre, unidad_base")
        .eq("id", productoId)
        .eq("organizacion_id", ctx.organizacionId)
        .maybeSingle(),
      supabase
        .from("bodegas")
        .select("id, nombre")
        .eq("organizacion_id", ctx.organizacionId)
        .eq("activa", true),
      supabase
        .from("existencias")
        .select("bodega_id, cantidad, costo_promedio")
        .eq("producto_id", productoId),
      supabase
        .from("movimientos_inventario")
        .select("id, tipo, cantidad, costo_unitario, saldo_cantidad, motivo, creado_en")
        .eq("producto_id", productoId)
        .order("id", { ascending: false })
        .limit(100),
    ]);
  if (!producto) notFound();

  return (
    <section className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <Link href="/inventario" className="text-sm text-muted-foreground underline">
        ← Inventario
      </Link>
      <h1 className="text-xl font-semibold">{producto.nombre}</h1>

      <ul className="grid grid-cols-2 gap-3">
        {(bodegas ?? []).map((b) => {
          const e = (existencias ?? []).find((x) => x.bodega_id === b.id);
          return (
            <li key={b.id} className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">{b.nombre}</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatoCantidad(e?.cantidad ?? 0)} {producto.unidad_base}
              </p>
              <p className="text-xs text-muted-foreground">
                Costo prom. {formatoCOP(e?.costo_promedio ?? 0)}
              </p>
            </li>
          );
        })}
      </ul>

      {puede(ctx.rol, "inventario.ajustar") ? (
        <FormAjuste productoId={producto.id} bodegas={bodegas ?? []} />
      ) : null}

      <div className="space-y-2">
        <h2 className="font-medium">Kardex (últimos 100 movimientos)</h2>
        {(movs ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {(movs ?? []).map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{ETIQUETA_MOVIMIENTO[m.tipo] ?? m.tipo}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatoFechaHora(m.creado_en)}
                    {m.motivo ? ` · ${m.motivo}` : ""}
                  </p>
                </div>
                <span className={`tabular-nums ${SALIDAS.has(m.tipo) ? "text-destructive" : ""}`}>
                  {SALIDAS.has(m.tipo) ? "−" : "+"}
                  {formatoCantidad(m.cantidad)}
                </span>
                <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                  saldo {formatoCantidad(m.saldo_cantidad ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
