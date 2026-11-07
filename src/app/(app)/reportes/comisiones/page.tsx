import type { Metadata } from "next";
import Link from "next/link";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP, sumar } from "@/lib/dinero";
import { hoyBogota, sumarDias } from "@/lib/fechas";
import { primerDiaDelMes, zMes } from "@/lib/validaciones/comisiones";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FormComision, FormMeta } from "./formularios";

export const metadata: Metadata = { title: "Metas y comisiones" };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export default async function Pagina({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ctx = await requerirContexto();
  const puedeVerTodo = ctx.rol === "dueno" || ctx.rol === "admin" || ctx.rol === "contador";
  const { mes: pedido } = await searchParams;
  const mesActual = primerDiaDelMes(hoyBogota());
  const parsed = pedido ? zMes.safeParse(pedido) : null;
  const mes = parsed?.success ? parsed.data : mesActual;
  const anterior = primerDiaDelMes(sumarDias(mes, -1));
  const siguiente = primerDiaDelMes(sumarDias(mes, 32));

  const supabase = await crearClienteServidor();
  const { data } = puedeVerTodo
    ? await supabase.rpc("reporte_comisiones", { p_org: ctx.organizacionId, p_mes: mes })
    : await supabase.rpc("mi_avance_mes", { p_org: ctx.organizacionId, p_mes: mes });
  const filas = data ?? [];
  const totalComisiones = sumar(...filas.map((f) => f.comision));
  const admin = ctx.rol === "dueno" || ctx.rol === "admin";

  return (
    <section className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <Link href="/reportes" className="text-sm text-muted-foreground underline">← Reportes</Link>
      <h1 className="text-xl font-semibold">{puedeVerTodo ? "Metas y comisiones" : "Mi avance"}</h1>
      <nav className="flex items-center justify-between text-sm" aria-label="Mes">
        <Link href={`/reportes/comisiones?mes=${anterior.slice(0, 7)}`} className="text-primary underline">← {nombreMes(anterior)}</Link>
        <strong className="capitalize">{nombreMes(mes)}</strong>
        {mes < mesActual ? <Link href={`/reportes/comisiones?mes=${siguiente.slice(0, 7)}`} className="text-primary underline">{nombreMes(siguiente)} →</Link> : <span className="w-24" />}
      </nav>

      {puedeVerTodo ? (
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Comisiones del mes</p><p className="text-lg font-semibold tabular-nums">{formatoCOP(totalComisiones)}</p></div>
      ) : null}

      <ul className="space-y-3">
        {filas.map((f) => {
          const pct = f.cumplimiento === null ? null : Math.min(100, Number(f.cumplimiento));
          return (
            <li key={f.usuario_id} className="space-y-2 rounded-xl border p-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{f.nombre}</span>
                <span className="font-semibold tabular-nums">{formatoCOP(f.ventas_netas)}</span>
              </div>
              {pct !== null ? (
                <>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Cumplimiento de la meta">
                    <div className={`h-full ${Number(f.cumplimiento) >= 100 ? "bg-primary" : "bg-primary/60"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">Meta {formatoCOP(f.meta)} · {Number(f.cumplimiento)} % {Number(f.cumplimiento) >= 100 ? "🎯 cumplida" : ""}</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Sin meta fijada este mes.</p>
              )}
              <p className="flex justify-between text-xs">
                <span className="text-muted-foreground">{f.ventas} venta(s) · {Number(f.porcentaje)} % sobre {f.base}</span>
                <span className="font-medium">Comisión {formatoCOP(f.comision)}</span>
              </p>
            </li>
          );
        })}
        {filas.length === 0 ? <li className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No hay ventas este mes.</li> : null}
      </ul>

      {admin ? (
        <>
          <FormMeta mes={mes} personas={filas.map((f) => ({ id: f.usuario_id, nombre: f.nombre }))} />
          <FormComision personas={filas.map((f) => ({ id: f.usuario_id, nombre: f.nombre }))} />
        </>
      ) : null}
    </section>
  );
}
