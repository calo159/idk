import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatoCOP } from "@/lib/dinero";
import { formatoFecha } from "@/lib/fechas";
import { requerirDistribuidor } from "@/server/distribuidor";
import { AccionesOferta } from "./acciones-oferta";

export const metadata: Metadata = { title: "Oferta · Portal del distribuidor", robots: { index: false, follow: false } };

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, distribuidor } = await requerirDistribuidor();
  const [{ data: o }, { data: filas }] = await Promise.all([
    supabase.from("ofertas_grupales").select("id, titulo, descripcion, unidad, estado, precio_referencia, precio_final, total_final, cierra_en, entrega_estimada, ofertas_escalas(cantidad_desde, precio_unitario)").eq("id", id).eq("distribuidor_id", distribuidor.id).maybeSingle(),
    supabase.rpc("compromisos_de_oferta", { p_oferta: id }),
  ]);
  if (!o) notFound();
  const escalas = [...o.ofertas_escalas].sort((a, b) => Number(a.cantidad_desde) - Number(b.cantidad_desde));
  const total = (filas ?? []).reduce((t, f) => t + Number(f.cantidad), 0);
  const actual = [...escalas].reverse().find((e) => Number(e.cantidad_desde) <= total);
  return (
    <main className="mx-auto min-h-dvh max-w-3xl space-y-5 px-4 py-6">
      <Link href="/distribuidor" className="text-sm text-muted-foreground underline">← Mis ofertas</Link>
      <header>
        <h1 className="text-xl font-semibold">{o.titulo}</h1>
        {o.descripcion ? <p className="text-sm text-muted-foreground">{o.descripcion}</p> : null}
        <p className="text-xs text-muted-foreground">Cierra el {formatoFecha(o.cierra_en)}{o.entrega_estimada ? ` · entrega ${formatoFecha(o.entrega_estimada)}` : ""} · estado: {o.estado}</p>
      </header>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Negocios</p><p className="text-lg font-semibold tabular-nums">{(filas ?? []).length}</p></div>
        <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Comprometido</p><p className="text-lg font-semibold tabular-nums">{total} {o.unidad}</p></div>
        <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{o.precio_final ? "Precio final" : "Precio hoy"}</p><p className="text-lg font-semibold tabular-nums">{o.precio_final ? formatoCOP(o.precio_final) : actual ? formatoCOP(actual.precio_unitario) : "—"}</p></div>
      </div>

      <ul className="space-y-0.5 rounded-xl border p-4 text-sm">
        {escalas.map((e) => <li key={e.cantidad_desde} className={total >= Number(e.cantidad_desde) ? "font-medium" : "text-muted-foreground"}>{total >= Number(e.cantidad_desde) ? "✔ " : ""}Desde {Number(e.cantidad_desde)} {o.unidad}: {formatoCOP(e.precio_unitario)} c/u (precio normal {formatoCOP(o.precio_referencia)})</li>)}
      </ul>

      <AccionesOferta oferta={o.id} estado={o.estado} total={total} primeraEscala={Number(escalas[0]?.cantidad_desde ?? 0)} unidad={o.unidad} />

      <section className="space-y-2">
        <h2 className="font-medium">Negocios que se unieron</h2>
        {(filas ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Todavía nadie.</p> : (
          <ul className="divide-y rounded-xl border text-sm">
            {(filas ?? []).map((f, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span><span className="block font-medium">{f.negocio}</span><span className="block text-xs text-muted-foreground">{f.ciudad ?? ""}{f.whatsapp ? ` · ${f.whatsapp}` : ""}</span></span>
                <span className="text-right tabular-nums">{Number(f.cantidad)} {o.unidad}{f.total_a_pagar !== null ? <span className="block text-xs text-muted-foreground">{formatoCOP(f.total_a_pagar)}</span> : null}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
