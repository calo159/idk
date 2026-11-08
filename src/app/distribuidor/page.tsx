import type { Metadata } from "next";
import Link from "next/link";
import { formatoCOP } from "@/lib/dinero";
import { formatoFecha, hoyBogota, sumarDias } from "@/lib/fechas";
import { requerirDistribuidor } from "@/server/distribuidor";
import { NuevaOferta } from "./nueva-oferta";

export const metadata: Metadata = { title: "Portal del distribuidor", robots: { index: false, follow: false } };

const ESTADO: Record<string, string> = { abierta: "Abierta", cerrada: "Cerrada", cancelada: "Cancelada", entregada: "Entregada" };

export default async function Pagina() {
  const { supabase, distribuidor, correo } = await requerirDistribuidor();
  const hoy = hoyBogota();
  const { data: ofertas } = await supabase
    .from("ofertas_grupales")
    .select("id, titulo, unidad, estado, cierra_en, precio_referencia, precio_final, total_final, compromisos_grupales(cantidad)")
    .eq("distribuidor_id", distribuidor.id)
    .order("creado_en", { ascending: false })
    .limit(100);
  return (
    <main className="mx-auto min-h-dvh max-w-3xl space-y-5 px-4 py-6">
      <header>
        <h1 className="text-xl font-semibold">{distribuidor.nombre}</h1>
        <p className="text-sm text-muted-foreground">Portal del distribuidor · {correo}</p>
      </header>
      <p className="text-sm text-muted-foreground">Publica una oferta con precios por volumen: los negocios se unen y, mientras más se junten, más baja el precio. Tú ves cuánto se ha comprometido y a quién entregar.</p>
      <NuevaOferta manana={sumarDias(hoy, 1)} maxima={sumarDias(hoy, 60)} />

      <section className="space-y-2">
        <h2 className="font-medium">Tus ofertas</h2>
        {(ofertas ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aún no has publicado ninguna oferta.</p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {(ofertas ?? []).map((o) => {
              const total = o.compromisos_grupales.reduce((t, c) => t + Number(c.cantidad), 0);
              const vencida = o.estado === "abierta" && o.cierra_en < hoy;
              return (
                <li key={o.id}>
                  <Link href={`/distribuidor/ofertas/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{o.titulo}</span>
                      <span className="block text-xs text-muted-foreground">
                        {o.compromisos_grupales.length} negocio(s) · {total} {o.unidad} · {o.estado === "abierta" ? `cierra ${formatoFecha(o.cierra_en)}` : o.precio_final ? `precio final ${formatoCOP(o.precio_final)}` : ""}
                      </span>
                    </span>
                    <span className={`text-xs ${vencida ? "font-medium text-destructive" : ""}`}>{vencida ? "Venció: ciérrala" : ESTADO[o.estado] ?? o.estado}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
