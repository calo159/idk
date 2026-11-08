import type { Metadata } from "next";
import Link from "next/link";
import { formatoCOP } from "@/lib/dinero";
import { formatoFecha, haceCuanto } from "@/lib/fechas";
import { ETIQUETA_ESTADO, estadoSeguro } from "@/lib/suscripcion";
import { requerirSuperAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Panel Surtix", robots: { index: false, follow: false } };

interface Metricas {
  negocios: number;
  en_prueba: number;
  activos: number;
  en_gracia: number;
  vencidos: number;
  suspendidos: number;
  nuevos_30d: number;
  mrr: number;
}

export default async function Pagina({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase, correo } = await requerirSuperAdmin();
  const { q = "" } = await searchParams;
  const [{ data: m }, { data: negocios }] = await Promise.all([
    supabase.rpc("admin_metricas"),
    supabase.rpc("admin_listar_negocios", { p_buscar: q.slice(0, 80), p_limite: 200 }),
  ]);
  const met = (m ?? {}) as unknown as Metricas;
  const tarjeta = (titulo: string, valor: string) => (
    <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{titulo}</p><p className="text-lg font-semibold tabular-nums">{valor}</p></div>
  );
  return (
    <main className="mx-auto min-h-dvh max-w-4xl space-y-5 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Panel Surtix</h1>
        <span className="text-xs text-muted-foreground">{correo}</span>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tarjeta("Negocios", String(met.negocios ?? 0))}
        {tarjeta("En prueba", String(met.en_prueba ?? 0))}
        {tarjeta("Pagando", String(met.activos ?? 0))}
        {tarjeta("Ingreso mensual (aprox.)", formatoCOP(met.mrr ?? 0))}
        {tarjeta("Nuevos (30 días)", String(met.nuevos_30d ?? 0))}
        {tarjeta("En gracia", String(met.en_gracia ?? 0))}
        {tarjeta("Vencidos", String(met.vencidos ?? 0))}
        {tarjeta("Suspendidos", String(met.suspendidos ?? 0))}
      </div>

      <form role="search" className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Nombre del negocio o correo del dueño" aria-label="Buscar negocios" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm" />
        <button type="submit" className="h-11 rounded-lg border px-4 text-sm">Buscar</button>
      </form>

      {(negocios ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No hay negocios que coincidan.</p>
      ) : (
        <ul className="divide-y rounded-xl border text-sm">
          {(negocios ?? []).map((n) => {
            const estado = estadoSeguro(n.estado);
            return (
              <li key={n.id}>
                <Link href={`/admin/negocios/${n.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{n.nombre}</span>
                    <span className="block truncate text-xs text-muted-foreground">{n.dueno} · {n.correo_dueno} · {n.nicho} · {n.ciudad}</span>
                  </span>
                  <span className="text-xs">{n.plan} · {ETIQUETA_ESTADO[estado]}</span>
                  <span className="text-xs text-muted-foreground">{n.usuarios} usuario(s) · {n.ventas_30d} ventas/30d · {n.ultima_venta ? `última venta ${haceCuanto(n.ultima_venta)}` : "sin ventas"} · desde {formatoFecha(n.creado_en)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
