import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP, sumar } from "@/lib/dinero";
import { puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cn } from "@/lib/utils";
import { estadoCartera } from "@/lib/validaciones/clientes";
import { formatoCelular } from "@/lib/validaciones/comunes";

export const metadata: Metadata = { title: "Clientes" };

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; deuda?: string }>;
}) {
  const ctx = await requerirContexto();
  const { q = "", deuda } = await searchParams;
  const supabase = await crearClienteServidor();
  let consulta = supabase
    .from("clientes")
    .select("id, nombre, telefono, cupo_credito, saldo")
    .eq("organizacion_id", ctx.organizacionId)
    .eq("activo", true)
    .order("nombre")
    .limit(300);
  const t = q.replace(/[%_,()*\\]/g, " ").trim();
  if (t) consulta = consulta.or(`nombre.ilike.%${t}%,telefono.ilike.%${t}%,documento.ilike.%${t}%`);
  if (deuda) consulta = consulta.gt("saldo", 0);
  const { data: clientes } = await consulta;
  const { data: cartera } = await supabase.rpc("cartera_clientes", { p_org: ctx.organizacionId });
  const categoria = new Map((cartera ?? []).map((c) => [c.cliente_id, c.categoria]));
  const porCobrar = sumar(...(clientes ?? []).map((c) => c.saldo));

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Clientes</h1>
        <Link href="/clientes/fidelizacion" className={cn(buttonVariants({ variant: "outline" }), "ml-auto h-10")}>
          Fidelización
        </Link>
        {puedeEscribir(ctx.rol, "clientes") ? (
          <Link href="/clientes/nuevo" className={cn(buttonVariants(), "h-10")}>
            <Plus className="size-4" aria-hidden /> Nuevo
          </Link>
        ) : null}
      </header>
      <div className="rounded-xl border p-4">
        <p className="text-xs text-muted-foreground">Por cobrar{deuda ? " (con deuda)" : ""}</p>
        <p className="text-lg font-semibold tabular-nums">{formatoCOP(porCobrar)}</p>
      </div>
      <form className="flex gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Nombre, celular o cédula"
          aria-label="Buscar clientes"
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="deuda" value="1" defaultChecked={!!deuda} /> Con deuda
        </label>
        <button className="h-11 rounded-lg border px-3 text-sm">Buscar</button>
      </form>
      {(clientes ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No hay clientes para mostrar.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {(clientes ?? []).map((c) => {
            const estado = estadoCartera(c.cupo_credito, c.saldo);
            return (
              <li key={c.id}>
                <Link href={`/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.nombre}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.telefono ? formatoCelular(c.telefono) : "Sin celular"}
                    </p>
                  </div>
                  {categoria.get(c.id) === "malo" ? <Badge variant="destructive">No fiar más</Badge> : null}
                  {estado === "excedido" ? <Badge variant="destructive">Excede cupo</Badge> : null}
                  {estado === "cerca_del_cupo" ? <Badge variant="secondary">Cerca del cupo</Badge> : null}
                  <span className="text-sm font-medium tabular-nums">
                    {Number(c.saldo) > 0 ? formatoCOP(c.saldo) : "—"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
