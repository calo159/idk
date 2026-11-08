import type { Metadata } from "next";
import Link from "next/link";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoFecha } from "@/lib/fechas";
import { ETIQUETA_NIVEL, type Nivel, prioridad } from "@/lib/salud";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cargarSalud } from "@/server/salud";

export const metadata: Metadata = { title: "Salud del negocio" };

const COLOR_NIVEL: Record<Nivel, string> = {
  excelente: "text-emerald-600 dark:text-emerald-400",
  bien: "text-lime-600 dark:text-lime-400",
  atencion: "text-amber-600 dark:text-amber-400",
  critico: "text-red-600 dark:text-red-400",
};
const FONDO_BARRA = (p: number) => (p >= 80 ? "bg-emerald-500" : p >= 60 ? "bg-lime-500" : p >= 40 ? "bg-amber-500" : "bg-red-500");

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin" && ctx.rol !== "contador")
    return <p className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">Este informe es para el dueño, los administradores y el contador.</p>;
  const r = await cargarSalud(await crearClienteServidor(), ctx.organizacionId);
  if (!r) return <p className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">No pudimos calcular la salud del negocio ahora. Intenta de nuevo en un momento.</p>;
  const { salud } = r;
  const foco = prioridad(salud);
  return (
    <section className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <Link href="/reportes" className="text-sm text-muted-foreground underline">← Reportes</Link>
      <h1 className="text-xl font-semibold">Salud de tu negocio</h1>

      <div className="rounded-xl border p-5 text-center">
        {salud.puntaje === null ? (
          <p className="text-sm text-muted-foreground">Aún no hay datos suficientes. Registra ventas e inventario y vuelve en unos días.</p>
        ) : (
          <>
            <p role="meter" aria-valuenow={salud.puntaje} aria-valuemin={0} aria-valuemax={100} aria-label="Puntaje de salud del negocio" className={`text-6xl font-bold tabular-nums ${COLOR_NIVEL[salud.nivel!]}`}>{salud.puntaje}</p>
            <p className={`font-medium ${COLOR_NIVEL[salud.nivel!]}`}>{ETIQUETA_NIVEL[salud.nivel!]}</p>
            {r.cambio !== null ? <p className="text-sm text-muted-foreground">{r.cambio === 0 ? "Igual que hace un mes" : `${r.cambio > 0 ? "▲" : "▼"} ${Math.abs(r.cambio)} punto(s) frente a hace un mes`}</p> : null}
            <p className="mt-1 text-xs text-muted-foreground">Del {formatoFecha(r.desde)} al {formatoFecha(r.hasta)}</p>
          </>
        )}
      </div>

      {foco ? (
        <div className="space-y-1 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="font-medium">Lo que más te ayudaría ahora</p>
          <p>{foco.consejo}</p>
          {foco.href ? <Link href={foco.href} className="inline-block pt-1 text-primary underline">Ir a arreglarlo</Link> : null}
        </div>
      ) : null}

      <ul className="space-y-3">
        {salud.componentes.map((c) => (
          <li key={c.clave} className="space-y-1.5 rounded-xl border p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-medium">{c.etiqueta}</p>
              <p className="text-sm tabular-nums text-muted-foreground">{c.puntaje === null ? "Sin datos" : `${c.puntaje}/100`}</p>
            </div>
            {c.puntaje !== null ? (
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className={`h-full ${FONDO_BARRA(c.puntaje)}`} style={{ width: `${c.puntaje}%` }} />
              </div>
            ) : null}
            <p className="text-sm text-muted-foreground">{c.detalle}</p>
            {c.consejo ? <p className="text-sm">{c.consejo}{c.href ? <> <Link href={c.href} className="text-primary underline">Ver</Link></> : null}</p> : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">El puntaje combina margen (30 %), rotación del inventario (25 %), cartera (25 %) y pérdidas (20 %) de los últimos 30 días. Es una guía, no un diagnóstico contable.</p>
    </section>
  );
}
