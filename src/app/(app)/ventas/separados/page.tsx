import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP, restar } from "@/lib/dinero";
import { formatoFecha, hoyBogota } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cn } from "@/lib/utils";
import { PanelSeparado } from "./panel";

export const metadata: Metadata = { title: "Separados" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("separados")
    .select("id, numero, estado, total, abonado, fecha_limite, clientes(nombre), separados_detalle(cantidad, productos(nombre))")
    .eq("organizacion_id", ctx.organizacionId)
    .order("estado")
    .order("creado_en", { ascending: false })
    .limit(80);
  const hoy = hoyBogota();
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/ventas/historial" className="text-sm text-muted-foreground underline">← Ventas</Link>
          <h1 className="text-xl font-semibold">Separados</h1>
        </div>
        {puede(ctx.rol, "ventas.confirmar") ? <Link href="/ventas/separados/nuevo" className={cn(buttonVariants(), "h-10")}>Nuevo</Link> : null}
      </div>
      <p className="text-sm text-muted-foreground">El cliente aparta mercancía y la va pagando. Hasta la entrega, el producto sigue en tu inventario pero queda reservado.</p>
      <ul className="space-y-3">
        {(data ?? []).map((s) => {
          const falta = restar(s.total, s.abonado);
          const pct = Math.min(100, Math.round((Number(s.abonado) / Number(s.total)) * 100));
          const vencido = s.estado === "activo" && s.fecha_limite && s.fecha_limite < hoy;
          return (
            <li key={s.id} className="space-y-2 rounded-xl border p-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">#{s.numero} · {s.clientes?.nombre}</span>
                {s.estado === "entregado" ? <Badge>Entregado</Badge> : s.estado === "cancelado" ? <Badge variant="destructive">Cancelado</Badge> : vencido ? <Badge variant="destructive">Plazo vencido</Badge> : <Badge variant="secondary">Activo</Badge>}
              </div>
              <p className="truncate text-xs text-muted-foreground">{s.separados_detalle.map((d) => `${Number(d.cantidad)} × ${d.productos?.nombre}`).join(" · ")}</p>
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Pagado">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <p className="flex justify-between text-xs"><span>Abonado {formatoCOP(s.abonado)} de {formatoCOP(s.total)}</span><span className="font-medium">Falta {formatoCOP(falta)}</span></p>
              {s.fecha_limite ? <p className="text-xs text-muted-foreground">Plazo: {formatoFecha(s.fecha_limite)}</p> : null}
              {s.estado === "activo" && puede(ctx.rol, "abonos.registrar") ? (
                <PanelSeparado id={s.id} falta={Number(falta)} puedeCancelar={ctx.rol === "dueno" || ctx.rol === "admin"} />
              ) : null}
            </li>
          );
        })}
        {(data ?? []).length === 0 ? <li className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Aún no hay separados.</li> : null}
      </ul>
    </section>
  );
}
