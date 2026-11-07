import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCantidad, formatoCOP, sumar } from "@/lib/dinero";
import { formatoFecha, hoyBogota, sumarDias } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reportes de inventario" };

const VISTAS = [
  { v: "valorizado", t: "Valorizado" },
  { v: "abc", t: "ABC" },
  { v: "rotacion", t: "Rotación" },
  { v: "dormida", t: "Plata dormida" },
] as const;

export default async function Pagina({ searchParams }: { searchParams: Promise<{ vista?: string; dias?: string }> }) {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin" && ctx.rol !== "contador") {
    return <p className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">Estos reportes son para el dueño, los administradores y el contador.</p>;
  }
  const sp = await searchParams;
  const vista = VISTAS.some((x) => x.v === sp.vista) ? sp.vista! : "valorizado";
  const dias = [30, 60, 90, 180].includes(Number(sp.dias)) ? Number(sp.dias) : 60;
  const supabase = await crearClienteServidor();
  const hoy = hoyBogota();
  const hace = (n: number) => sumarDias(hoy, -n);
  const org = ctx.organizacionId;

  const cuerpo = async () => {
    if (vista === "abc") {
      const { data } = await supabase.rpc("reporte_abc", { p_org: org, p_desde: hace(89), p_hasta: hoy });
      return (
        <>
          <p className="text-xs text-muted-foreground">Últimos 90 días. A = productos que dan el 80 % de tus ventas; cuídalos primero.</p>
          <ul className="divide-y rounded-xl border text-sm">
            {(data ?? []).map((p) => (
              <li key={p.producto_id} className="flex items-center gap-3 px-4 py-2.5">
                <Badge variant={p.clase === "A" ? "default" : "secondary"}>{p.clase}</Badge>
                <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                <span className="text-xs text-muted-foreground">{Number(p.participacion)} %</span>
                <span className="font-medium tabular-nums">{formatoCOP(p.ingreso)}</span>
              </li>
            ))}
          </ul>
        </>
      );
    }
    if (vista === "rotacion") {
      const { data } = await supabase.rpc("reporte_rotacion", { p_org: org, p_desde: hace(29), p_hasta: hoy });
      return (
        <>
          <p className="text-xs text-muted-foreground">Últimos 30 días. “Días de inventario” = cuántos días te dura el stock al ritmo actual.</p>
          <ul className="divide-y rounded-xl border text-sm">
            {(data ?? []).map((p) => (
              <li key={p.producto_id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                <span className="text-xs text-muted-foreground">vende {formatoCantidad(p.venta_diaria)}/día</span>
                <span className={cn("w-24 text-right tabular-nums", p.dias_de_inventario === null ? "text-muted-foreground" : Number(p.dias_de_inventario) < 7 ? "font-medium text-destructive" : "")}>
                  {p.dias_de_inventario === null ? "sin ventas" : `${Number(p.dias_de_inventario)} días`}
                </span>
              </li>
            ))}
          </ul>
        </>
      );
    }
    if (vista === "dormida") {
      const { data } = await supabase.rpc("reporte_plata_dormida", { p_org: org, p_dias: dias });
      const total = sumar(...(data ?? []).map((p) => p.valor));
      return (
        <>
          <div className="flex flex-wrap gap-2">
            {[30, 60, 90, 180].map((d) => (
              <Link key={d} href={`/reportes/inventario?vista=dormida&dias=${d}`} className={cn("rounded-full border px-3 py-1 text-sm", d === dias && "border-primary bg-primary text-primary-foreground")}>
                {d} días
              </Link>
            ))}
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">Plata parada en productos que no se venden hace {dias}+ días</p>
            <p className="text-lg font-semibold tabular-nums">{formatoCOP(total)}</p>
          </div>
          <ul className="divide-y rounded-xl border text-sm">
            {(data ?? []).map((p) => (
              <li key={p.producto_id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.nombre}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatoCantidad(p.cantidad)} u. · {p.ultima_venta ? `última venta ${formatoFecha(p.ultima_venta)}` : "nunca se ha vendido"}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{formatoCOP(p.valor)}</span>
              </li>
            ))}
            {(data ?? []).length === 0 ? <li className="px-4 py-8 text-center text-muted-foreground">No tienes plata dormida. ✔</li> : null}
          </ul>
        </>
      );
    }
    const { data } = await supabase.rpc("reporte_inventario_valorizado", { p_org: org });
    const total = sumar(...(data ?? []).map((p) => p.valor));
    return (
      <>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Valor del inventario a costo</p>
          <p className="text-lg font-semibold tabular-nums">{formatoCOP(total)}</p>
        </div>
        <ul className="divide-y rounded-xl border text-sm">
          {(data ?? []).map((p) => (
            <li key={p.producto_id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.nombre}</span>
                <span className="block text-xs text-muted-foreground">{p.categoria} · {formatoCantidad(p.cantidad)} u. a {formatoCOP(p.costo_promedio)}</span>
              </span>
              <span className="font-medium tabular-nums">{formatoCOP(p.valor)}</span>
            </li>
          ))}
        </ul>
      </>
    );
  };

  return (
    <section className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <Link href="/reportes" className="text-sm text-muted-foreground underline">← Reportes de ventas</Link>
      <h1 className="text-xl font-semibold">Reportes de inventario</h1>
      <nav aria-label="Vista" className="flex flex-wrap gap-2">
        {VISTAS.map((x) => (
          <Link key={x.v} href={`/reportes/inventario?vista=${x.v}`} aria-current={x.v === vista ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1.5 text-sm", x.v === vista ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {x.t}
          </Link>
        ))}
      </nav>
      {await cuerpo()}
    </section>
  );
}
