import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCantidad, formatoCOP } from "@/lib/dinero";
import { ETIQUETA_ESTADO } from "@/lib/etiquetas";
import { formatoFechaHora } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { zUuid } from "@/lib/validaciones/comunes";
import { FormAnularVenta } from "./anular";

export const metadata: Metadata = { title: "Venta" };

const VERIFICACION: Record<string, string> = {
  verificado_ia: "Verificado por IA",
  verificado_manual: "Verificado",
  sin_verificar: "Sin verificar",
  sospechoso: "Sospechoso",
};

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requerirContexto();
  const { id } = await params;
  if (!zUuid.safeParse(id).success) notFound();
  const supabase = await crearClienteServidor();
  const [{ data: venta }, { data: lineas }, { data: pagos }] = await Promise.all([
    supabase
      .from("ventas")
      .select("id, numero, estado, total, descuento, costo_total, creado_en, motivo_anulacion, anulada_en, clientes(nombre)")
      .eq("id", id)
      .eq("organizacion_id", ctx.organizacionId)
      .maybeSingle(),
    supabase
      .from("ventas_detalle")
      .select("id, cantidad, precio_unitario, subtotal, productos(nombre), presentaciones(nombre)")
      .eq("venta_id", id),
    supabase.from("pagos_venta").select("id, metodo, monto, verificacion").eq("venta_id", id),
  ]);
  if (!venta) notFound();
  const verUtilidad = ctx.rol === "dueno" || ctx.rol === "admin" || ctx.rol === "contador";

  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <Link href="/ventas/historial" className="text-sm text-muted-foreground underline">
        ← Historial
      </Link>
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">Venta #{venta.numero ?? "—"}</h1>
          {venta.estado !== "confirmado" ? (
            <Badge variant={venta.estado === "anulado" ? "destructive" : "secondary"}>
              {ETIQUETA_ESTADO[venta.estado] ?? venta.estado}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {formatoFechaHora(venta.creado_en)} · {venta.clientes?.nombre ?? "Mostrador"}
        </p>
        {venta.motivo_anulacion ? (
          <p className="text-sm text-destructive">Motivo de anulación: {venta.motivo_anulacion}</p>
        ) : null}
      </header>

      <ul className="divide-y rounded-xl border text-sm">
        {(lineas ?? []).map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{l.productos?.nombre}</span>
              <span className="block text-xs text-muted-foreground">
                {formatoCantidad(l.cantidad)} {l.presentaciones?.nombre ?? ""} × {formatoCOP(l.precio_unitario)}
              </span>
            </span>
            <span className="font-medium tabular-nums">{formatoCOP(l.subtotal)}</span>
          </li>
        ))}
      </ul>

      <div className="space-y-1 text-sm">
        {Number(venta.descuento) > 0 ? (
          <div className="flex justify-between"><span>Descuento</span><span className="tabular-nums">−{formatoCOP(venta.descuento)}</span></div>
        ) : null}
        <div className="flex justify-between text-lg font-semibold"><span>Total</span><span className="tabular-nums">{formatoCOP(venta.total)}</span></div>
        {verUtilidad ? (
          <div className="flex justify-between text-muted-foreground">
            <span>Utilidad</span>
            <span className="tabular-nums">{formatoCOP(Number(venta.total) - Number(venta.costo_total))}</span>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <h2 className="font-medium">Pagos</h2>
        <ul className="divide-y rounded-xl border text-sm">
          {(pagos ?? []).map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1 capitalize">{p.metodo}</span>
              {p.verificacion !== "no_aplica" ? (
                <Badge variant={p.verificacion === "sospechoso" ? "destructive" : "secondary"}>
                  {VERIFICACION[p.verificacion] ?? p.verificacion}
                </Badge>
              ) : null}
              <span className="tabular-nums">{formatoCOP(p.monto)}</span>
            </li>
          ))}
        </ul>
      </div>

      {venta.estado === "confirmado" && puede(ctx.rol, "ventas.anular") ? <FormAnularVenta id={venta.id} /> : null}
    </section>
  );
}
