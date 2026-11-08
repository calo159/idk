import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCelular } from "@/lib/validaciones/comunes";
import { formatoCOP } from "@/lib/dinero";
import { haceCuanto } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { BotonRechazarPedido } from "./rechazar";

export const metadata: Metadata = { title: "Pedidos por WhatsApp" };

interface LineaPedido { nombre: string; cantidad: number; precio: number }
interface SinEmparejar { descripcion: string; cantidad: number; candidatos?: { nombre: string }[] }

export default async function Pagina({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const ctx = await requerirContexto();
  const { ver } = await searchParams;
  const todos = ver === "todos";
  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from("pedidos_whatsapp")
    .select("id, telefono, texto, lineas, no_encontrados, estado, motivo, creado_en, clientes(nombre)")
    .eq("organizacion_id", ctx.organizacionId)
    .order("creado_en", { ascending: false })
    .limit(60);
  if (!todos) consulta = consulta.eq("estado", "pendiente");
  const { data } = await consulta;
  const puedeVender = puede(ctx.rol, "ventas.confirmar");

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div>
        <Link href="/ventas/historial" className="text-sm text-muted-foreground underline">← Ventas</Link>
        <h1 className="text-xl font-semibold">Pedidos por WhatsApp</h1>
      </div>
      <nav className="flex gap-2 text-sm" aria-label="Filtro">
        <Link href="/ventas/pedidos" className={`rounded-full border px-3 py-1.5 ${!todos ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>Pendientes</Link>
        <Link href="/ventas/pedidos?ver=todos" className={`rounded-full border px-3 py-1.5 ${todos ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>Todos</Link>
      </nav>
      <ul className="space-y-3">
        {(data ?? []).map((p) => {
          const lineas = (Array.isArray(p.lineas) ? p.lineas : []) as unknown as LineaPedido[];
          const sin = (Array.isArray(p.no_encontrados) ? p.no_encontrados : []) as unknown as SinEmparejar[];
          return (
            <li key={p.id} className="space-y-2 rounded-xl border p-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{p.clientes?.nombre ?? formatoCelular(p.telefono)}</span>
                {p.estado === "confirmado" ? <Badge>Vendido</Badge> : p.estado === "rechazado" ? <Badge variant="destructive">Rechazado</Badge> : <Badge variant="secondary">Pendiente</Badge>}
                <span className="text-xs text-muted-foreground">{haceCuanto(p.creado_en)}</span>
              </div>
              <p className="rounded-lg bg-muted/50 p-2 text-xs italic">«{p.texto}»</p>
              {lineas.length > 0 ? (
                <ul className="space-y-0.5">
                  {lineas.map((l, i) => (
                    <li key={i} className="flex justify-between"><span>{l.cantidad} × {l.nombre}</span><span className="tabular-nums text-muted-foreground">{formatoCOP(l.cantidad * l.precio)}</span></li>
                  ))}
                </ul>
              ) : null}
              {sin.length > 0 ? (
                <div className="rounded-lg border border-amber-500/50 p-2 text-xs">
                  <p className="font-medium">Por confirmar con el cliente:</p>
                  <ul className="list-disc pl-4">
                    {sin.map((s, i) => (
                      <li key={i}>{s.cantidad} × «{s.descripcion}»{s.candidatos?.length ? ` — ¿${s.candidatos.map((c) => c.nombre).join(" o ")}?` : " — no está en tu catálogo"}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {p.motivo ? <p className="text-xs text-destructive">Motivo: {p.motivo}</p> : null}
              {p.estado === "pendiente" ? (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {puedeVender && lineas.length > 0 ? (
                    <Link href={`/ventas/pos?pedido=${p.id}`} className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">Preparar venta</Link>
                  ) : null}
                  <a className="text-xs text-primary underline" href={`https://wa.me/57${p.telefono}`} target="_blank" rel="noreferrer">Escribirle</a>
                  {puedeVender ? <BotonRechazarPedido id={p.id} /> : null}
                </div>
              ) : null}
            </li>
          );
        })}
        {(data ?? []).length === 0 ? <li className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{todos ? "Aún no hay pedidos." : "No hay pedidos pendientes. ✔"}</li> : null}
      </ul>
    </section>
  );
}
