import type { Metadata } from "next";
import Link from "next/link";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP } from "@/lib/dinero";
import { hoyBogota, sumarDias } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { ETIQUETA_RESULTADO, type ResultadoVisita } from "@/lib/validaciones/ruta";

export const metadata: Metadata = { title: "Visitas de ruta" };

const hora = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso));

export default async function Pagina({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin" && ctx.rol !== "contador")
    return <p className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">Este informe es para el dueño, los administradores y el contador.</p>;
  const { dia: pedido } = await searchParams;
  const hoy = hoyBogota();
  const dia = pedido && /^\d{4}-\d{2}-\d{2}$/.test(pedido) && pedido <= hoy ? pedido : hoy;
  const supabase = await crearClienteServidor();
  const [{ data: resumen }, { data: visitas }] = await Promise.all([
    supabase.rpc("resumen_rutas", { p_org: ctx.organizacionId, p_fecha: dia }),
    supabase.rpc("visitas_del_dia", { p_org: ctx.organizacionId, p_fecha: dia }),
  ]);
  return (
    <section className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <Link href="/reportes" className="text-sm text-muted-foreground underline">← Reportes</Link>
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Visitas de ruta</h1>
        <nav className="flex items-center gap-2 text-sm" aria-label="Cambiar de día">
          <Link href={`/reportes/visitas?dia=${sumarDias(dia, -1)}`} className="rounded-lg border px-3 py-1.5">←</Link>
          <span className="tabular-nums">{dia}{dia === hoy ? " (hoy)" : ""}</span>
          {dia < hoy ? <Link href={`/reportes/visitas?dia=${sumarDias(dia, 1)}`} className="rounded-lg border px-3 py-1.5">→</Link> : null}
        </nav>
      </header>

      {(resumen ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aún no tienes vendedores de ruta. Arma sus rutas en Configuración → Rutas de venta.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {(resumen ?? []).map((r) => (
            <li key={r.usuario_id} className="space-y-1 rounded-xl border p-4 text-sm">
              <p className="font-medium">{r.nombre}</p>
              <p>{r.visitadas} de {r.planificadas} visitas planeadas</p>
              <p className="text-xs text-muted-foreground">{r.pedidos} pedido(s) · {r.cobros} cobro(s) · {r.sin_pedido} sin pedido · {r.cerrados} cerrado(s)</p>
              <p className="font-semibold tabular-nums">Vendió {formatoCOP(r.ventas)}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <h2 className="font-medium">Detalle del día</h2>
        {(visitas ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin visitas registradas este día.</p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {(visitas ?? []).map((v) => (
              <li key={v.id} className="flex items-start gap-3 px-4 py-3">
                <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">{hora(v.visitado_en)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{v.cliente}</span>
                  <span className="block text-xs text-muted-foreground">{v.usuario} · {ETIQUETA_RESULTADO[v.resultado as ResultadoVisita] ?? v.resultado}</span>
                  {v.nota ? <span className="block text-xs">{v.nota}</span> : null}
                </span>
                {v.lat !== null && v.lng !== null ? (
                  <a href={`https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lng}`} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border px-2.5 py-1 text-xs">
                    Ver en mapa
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">Sin ubicación</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
