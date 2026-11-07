import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCantidad, formatoCOP, sumar } from "@/lib/dinero";
import { formatoFecha } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FormLote } from "../avanzado/formularios";

export const metadata: Metadata = { title: "Vencimientos" };

export default async function Pagina({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const ctx = await requerirContexto();
  const { dias: d } = await searchParams;
  const dias = [30, 60, 90, 180].includes(Number(d)) ? Number(d) : 60;
  const supabase = await crearClienteServidor();
  const puedeGestionar = puede(ctx.rol, "inventario.ajustar");
  const verDatos = ctx.rol !== "vendedor" && ctx.rol !== "ruta";
  const [{ data: venc }, { data: productos }, { data: bodegas }] = await Promise.all([
    verDatos ? supabase.rpc("vencimientos_proximos", { p_org: ctx.organizacionId, p_dias: dias }) : Promise.resolve({ data: [] }),
    puedeGestionar ? supabase.from("productos").select("id, nombre").eq("organizacion_id", ctx.organizacionId).eq("activo", true).eq("maneja_inventario", true).order("nombre").limit(3000) : Promise.resolve({ data: [] }),
    supabase.from("bodegas").select("id, nombre").eq("organizacion_id", ctx.organizacionId).eq("activa", true),
  ]);
  const riesgo = sumar(...(venc ?? []).map((v) => v.valor_en_riesgo));
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href="/inventario" className="text-sm text-muted-foreground underline">← Inventario</Link>
      <h1 className="text-xl font-semibold">Vencimientos</h1>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Plazo">
        {[30, 60, 90, 180].map((x) => <Link key={x} href={`/inventario/vencimientos?dias=${x}`} className={`rounded-full border px-3 py-1.5 ${x === dias ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{x} días</Link>)}
      </nav>
      <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Mercancía en riesgo (a costo) en los próximos {dias} días</p><p className="text-lg font-semibold tabular-nums">{formatoCOP(riesgo)}</p></div>
      <ul className="divide-y rounded-xl border text-sm">
        {(venc ?? []).map((v) => (
          <li key={v.lote_id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{v.producto}</span><span className="block text-xs text-muted-foreground">Lote {v.codigo} · {formatoCantidad(v.saldo)} u. · vence {formatoFecha(v.vence)}</span></span>
            <Badge variant={v.dias_para_vencer < 0 ? "destructive" : v.dias_para_vencer <= 15 ? "destructive" : "secondary"}>{v.dias_para_vencer < 0 ? `Vencido hace ${-v.dias_para_vencer} d` : `${v.dias_para_vencer} días`}</Badge>
            <span className="tabular-nums">{formatoCOP(v.valor_en_riesgo)}</span>
          </li>
        ))}
        {(venc ?? []).length === 0 ? <li className="px-4 py-8 text-center text-muted-foreground">Nada vence en este plazo. ✔</li> : null}
      </ul>
      {puedeGestionar && (productos ?? []).length > 0 ? <FormLote productos={productos ?? []} bodegas={bodegas ?? []} /> : null}
    </section>
  );
}
