import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP, sumar } from "@/lib/dinero";
import { ETIQUETA_ESTADO } from "@/lib/etiquetas";
import { finDiaBogota, formatoHora, hoyBogota, inicioDiaBogota } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { esDiaValido } from "@/lib/fechas";

export const metadata: Metadata = { title: "Historial de ventas" };

export default async function Pagina({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  const ctx = await requerirContexto();
  const { dia: diaPedido } = await searchParams;
  const dia = diaPedido && esDiaValido(diaPedido) ? diaPedido : hoyBogota();
  const supabase = await crearClienteServidor();
  const { data: ventas } = await supabase
    .from("ventas")
    .select("id, numero, estado, total, creado_en, clientes(nombre), pagos_venta(metodo, verificacion)")
    .eq("organizacion_id", ctx.organizacionId)
    .gte("creado_en", inicioDiaBogota(dia).toISOString())
    .lte("creado_en", finDiaBogota(dia).toISOString())
    .neq("estado", "borrador")
    .order("creado_en", { ascending: false })
    .limit(500);

  const confirmadas = (ventas ?? []).filter((v) => v.estado === "confirmado");
  const totalDia = sumar(...confirmadas.map((v) => v.total));

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Historial de ventas</h1>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/ventas/cotizaciones" className="rounded-full border px-3 py-1.5 hover:bg-muted">Cotizaciones</Link>
        <Link href="/ventas/pedidos" className="rounded-full border px-3 py-1.5 hover:bg-muted">Pedidos WhatsApp</Link>
        <Link href="/ventas/separados" className="rounded-full border px-3 py-1.5 hover:bg-muted">Separados</Link>
        <Link href="/ventas/ruta" className="rounded-full border px-3 py-1.5 hover:bg-muted">Mi ruta</Link>
      </div>
      <form className="flex gap-2">
        <input
          type="date"
          name="dia"
          defaultValue={dia}
          max={hoyBogota()}
          aria-label="Día"
          className="h-11 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
        />
        <button className="h-11 rounded-lg border px-4 text-sm">Ver</button>
      </form>
      <div className="rounded-xl border p-4">
        <p className="text-xs text-muted-foreground">{confirmadas.length} venta(s) confirmadas</p>
        <p className="text-lg font-semibold tabular-nums">{formatoCOP(totalDia)}</p>
      </div>
      {(ventas ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hubo ventas este día.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {(ventas ?? []).map((v) => (
            <li key={v.id}>
              <Link href={`/ventas/${v.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    #{v.numero ?? "—"} · {formatoHora(v.creado_en)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {v.clientes?.nombre ?? "Mostrador"} · {[...new Set(v.pagos_venta.map((p) => p.metodo))].join(", ")}
                  </p>
                </div>
                {v.pagos_venta.some((p) => p.verificacion === "sospechoso") ? (
                  <Badge variant="destructive">Pago sospechoso</Badge>
                ) : null}
                {v.estado !== "confirmado" ? (
                  <Badge variant="destructive">{ETIQUETA_ESTADO[v.estado] ?? v.estado}</Badge>
                ) : null}
                <span className="font-medium tabular-nums">{formatoCOP(v.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
