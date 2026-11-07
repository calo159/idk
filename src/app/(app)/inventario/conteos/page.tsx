import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoFechaHora } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FormNuevoConteo } from "./formularios";

export const metadata: Metadata = { title: "Conteos de inventario" };

const ESTADOS: Record<string, string> = { en_curso: "En curso", cerrado: "Cerrado", cancelado: "Cancelado" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  const supabase = await crearClienteServidor();
  const [{ data: conteos }, { data: bodegas }, { data: categorias }] = await Promise.all([
    supabase.from("conteos").select("id, nombre, estado, ajustes_aplicados, creado_en, bodegas(nombre)").eq("organizacion_id", ctx.organizacionId).order("creado_en", { ascending: false }).limit(30),
    supabase.from("bodegas").select("id, nombre").eq("organizacion_id", ctx.organizacionId).eq("activa", true),
    supabase.from("categorias").select("id, nombre").eq("organizacion_id", ctx.organizacionId).order("nombre"),
  ]);
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href="/inventario" className="text-sm text-muted-foreground underline">← Inventario</Link>
      <h1 className="text-xl font-semibold">Conteos físicos</h1>
      <p className="text-sm text-muted-foreground">
        Cuenta lo que hay en las repisas. Quien cuenta no ve lo que dice el sistema; al cerrar, se comparan y se ven las diferencias.
      </p>
      {puede(ctx.rol, "inventario.ajustar") ? <FormNuevoConteo bodegas={bodegas ?? []} categorias={categorias ?? []} /> : null}
      <ul className="divide-y rounded-xl border text-sm">
        {(conteos ?? []).map((c) => (
          <li key={c.id}>
            <Link href={`/inventario/conteos/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.nombre}</span>
                <span className="block text-xs text-muted-foreground">{c.bodegas?.nombre} · {formatoFechaHora(c.creado_en)}</span>
              </span>
              <Badge variant={c.estado === "en_curso" ? "default" : "secondary"}>{ESTADOS[c.estado]}</Badge>
              {c.ajustes_aplicados ? <Badge variant="secondary">Corregido</Badge> : null}
            </Link>
          </li>
        ))}
        {(conteos ?? []).length === 0 ? <li className="px-4 py-8 text-center text-muted-foreground">Aún no hay conteos.</li> : null}
      </ul>
    </section>
  );
}
