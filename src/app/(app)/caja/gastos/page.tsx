import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP, sumar } from "@/lib/dinero";
import { formatoFecha, rangoMes } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { BotonAnularGasto, FormGasto } from "./formularios";

export const metadata: Metadata = { title: "Gastos" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  const supabase = await crearClienteServidor();
  const { desde, hasta } = rangoMes();
  const [{ data: gastos }, { data: turno }] = await Promise.all([
    supabase
      .from("gastos")
      .select("id, categoria, descripcion, monto, metodo, fecha, estado, soporte_url")
      .eq("organizacion_id", ctx.organizacionId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false }),
    supabase
      .from("turnos_caja")
      .select("id")
      .eq("organizacion_id", ctx.organizacionId)
      .eq("usuario_id", ctx.usuarioId)
      .eq("estado", "abierto")
      .maybeSingle(),
  ]);
  const activos = (gastos ?? []).filter((g) => g.estado === "activo");
  const total = sumar(...activos.map((g) => g.monto));
  const porCategoria = new Map<string, number[]>();
  for (const g of activos) porCategoria.set(g.categoria, [...(porCategoria.get(g.categoria) ?? []), Number(g.monto)]);

  return (
    <section className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <Link href="/caja" className="text-sm text-muted-foreground underline">← Caja</Link>
      <h1 className="text-xl font-semibold">Gastos del mes</h1>
      <div className="rounded-xl border p-4">
        <p className="text-xs text-muted-foreground">Total del mes</p>
        <p className="text-lg font-semibold tabular-nums">{formatoCOP(total)}</p>
        <ul className="mt-2 space-y-0.5 text-sm">
          {[...porCategoria].map(([c, v]) => (
            <li key={c} className="flex justify-between">
              <span>{c}</span>
              <span className="tabular-nums">{formatoCOP(sumar(...v))}</span>
            </li>
          ))}
        </ul>
      </div>

      {puede(ctx.rol, "gastos.registrar") ? <FormGasto turnoId={turno?.id ?? null} /> : null}

      <ul className="divide-y rounded-xl border text-sm">
        {(gastos ?? []).map((g) => (
          <li key={g.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className={`truncate font-medium ${g.estado === "anulado" ? "line-through" : ""}`}>{g.descripcion}</p>
              <p className="truncate text-xs text-muted-foreground">
                {formatoFecha(g.fecha)} · {g.categoria} · {g.metodo}
                {g.soporte_url ? " · con soporte" : ""}
              </p>
            </div>
            {g.estado === "anulado" ? <Badge variant="destructive">Anulado</Badge> : null}
            <span className="tabular-nums">{formatoCOP(g.monto)}</span>
            {g.estado === "activo" && puede(ctx.rol, "gastos.anular") ? <BotonAnularGasto id={g.id} /> : null}
          </li>
        ))}
        {(gastos ?? []).length === 0 ? (
          <li className="px-4 py-8 text-center text-muted-foreground">Aún no hay gastos este mes.</li>
        ) : null}
      </ul>
    </section>
  );
}
