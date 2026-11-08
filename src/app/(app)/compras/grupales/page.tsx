import type { Metadata } from "next";
import Link from "next/link";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP } from "@/lib/dinero";
import { formatoFecha } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { ConvertirEnOrden, type OfertaVista, TarjetaOferta } from "./panel";

export const metadata: Metadata = { title: "Compras en grupo" };

const ESTADO: Record<string, string> = { abierta: "Abierta", cerrada: "Cerrada: precio fijado", cancelada: "Cancelada", entregada: "Entregada" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin" && ctx.rol !== "bodeguero")
    return <p className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">Las compras en grupo son para el dueño, los administradores y el bodeguero.</p>;
  const supabase = await crearClienteServidor();
  const [{ data: ofertas }, { data: mias }, { data: productos }, { data: bodegas }] = await Promise.all([
    supabase.rpc("ofertas_abiertas", { p_org: ctx.organizacionId }),
    supabase.rpc("mis_compras_grupales", { p_org: ctx.organizacionId }),
    supabase.from("productos").select("id, nombre").eq("organizacion_id", ctx.organizacionId).eq("activo", true).order("nombre").limit(1500),
    supabase.from("bodegas").select("id, nombre").eq("organizacion_id", ctx.organizacionId).eq("activa", true).order("nombre"),
  ]);
  const puedeComprometer = ctx.rol === "dueno" || ctx.rol === "admin";
  const vista: OfertaVista[] = (ofertas ?? []).map((o) => ({
    id: o.oferta_id, distribuidor: o.distribuidor, titulo: o.titulo, descripcion: o.descripcion, unidad: o.unidad, precioReferencia: Number(o.precio_referencia),
    cierraEn: o.cierra_en, entrega: o.entrega_estimada, minimo: Number(o.minimo_negocio), maximo: o.maximo_negocio === null ? null : Number(o.maximo_negocio),
    total: Number(o.total_comprometido), negocios: o.negocios, precioActual: o.precio_actual === null ? null : Number(o.precio_actual),
    escalas: (o.escalas as { desde: number; precio: number }[] | null) ?? [], mia: o.mi_cantidad === null ? null : Number(o.mi_cantidad),
  }));
  const cerradas = (mias ?? []).filter((m) => m.estado !== "abierta");

  return (
    <section className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <Link href="/compras" className="text-sm text-muted-foreground underline">← Compras</Link>
      <h1 className="text-xl font-semibold">Compras en grupo</h1>
      <p className="text-sm text-muted-foreground">Junta tu pedido con el de otros negocios y consigue el precio de mayorista. Mientras más se unan, más baja el precio <strong>para todos</strong>. Nadie ve quién más participa.</p>

      {vista.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No hay compras en grupo abiertas ahora. Cuando un distribuidor publique una, aparecerá aquí.</p>
      ) : (
        <ul className="space-y-4">
          {vista.map((o) => <TarjetaOferta key={o.id} o={o} puedeComprometer={puedeComprometer} formatoFecha={{ cierra: formatoFecha(o.cierraEn), entrega: o.entrega ? formatoFecha(o.entrega) : null }} />)}
        </ul>
      )}

      {cerradas.length > 0 ? (
        <div className="space-y-2">
          <h2 className="font-medium">Tus compras anteriores</h2>
          <ul className="space-y-3">
            {cerradas.map((m) => (
              <li key={m.oferta_id} className="space-y-2 rounded-xl border p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span><span className="block text-xs text-muted-foreground">{m.distribuidor}</span><span className="font-medium">{m.titulo}</span></span>
                  <span className="shrink-0 text-xs">{ESTADO[m.estado] ?? m.estado}</span>
                </div>
                {m.precio_final !== null ? (
                  <p>{Number(m.cantidad)} {m.unidad} × {formatoCOP(m.precio_final)} = <strong>{formatoCOP(m.total_a_pagar ?? 0)}</strong>{m.entrega_estimada ? ` · entrega ${formatoFecha(m.entrega_estimada)}` : ""}</p>
                ) : null}
                {(m.estado === "cerrada" || m.estado === "entregada") && !m.orden_compra_id ? (
                  <ConvertirEnOrden ofertaId={m.oferta_id} productos={productos ?? []} bodegas={bodegas ?? []} />
                ) : null}
                {m.orden_compra_id ? <Link href="/compras/ordenes" className="text-primary underline">Ya tiene orden de compra</Link> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
