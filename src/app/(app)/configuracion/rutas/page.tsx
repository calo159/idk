import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { EditorRutas } from "./panel";

export const metadata: Metadata = { title: "Rutas de venta" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") redirect("/configuracion");
  const supabase = await crearClienteServidor();
  const [{ data: miembros }, { data: clientes }, { data: plan }] = await Promise.all([
    supabase.from("miembros").select("usuario_id, nombre, rol").eq("organizacion_id", ctx.organizacionId).eq("activo", true).in("rol", ["ruta", "vendedor"]).order("nombre"),
    supabase.from("clientes").select("id, nombre").eq("organizacion_id", ctx.organizacionId).eq("activo", true).order("nombre").limit(1000),
    supabase.from("ruta_clientes").select("usuario_id, dia_semana, cliente_id, orden").eq("organizacion_id", ctx.organizacionId).order("orden").limit(5000),
  ]);
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href="/configuracion" className="text-sm text-muted-foreground underline">← Configuración</Link>
      <h1 className="text-xl font-semibold">Rutas de venta</h1>
      <p className="text-sm text-muted-foreground">Define qué clientes visita cada vendedor cada día y en qué orden. Cada uno verá su lista en <strong>Ventas → Mi ruta</strong>, también sin internet.</p>
      <EditorRutas
        vendedores={(miembros ?? []).map((m) => ({ id: m.usuario_id, nombre: m.nombre }))}
        clientes={clientes ?? []}
        plan={(plan ?? []).map((p) => ({ usuarioId: p.usuario_id, dia: p.dia_semana, clienteId: p.cliente_id }))}
      />
    </section>
  );
}
