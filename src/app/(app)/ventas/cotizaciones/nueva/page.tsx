import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cargarCatalogoSelector } from "@/server/catalogo";
import { FormularioCotizacion } from "./formulario";

export const metadata: Metadata = { title: "Nueva cotización" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "ventas.confirmar")) redirect("/ventas/cotizaciones");
  const supabase = await crearClienteServidor();
  const [catalogo, { data: clientes }] = await Promise.all([
    cargarCatalogoSelector(supabase, ctx.organizacionId),
    supabase.from("clientes").select("id, nombre").eq("organizacion_id", ctx.organizacionId).eq("activo", true).order("nombre").limit(1000),
  ]);
  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <Link href="/ventas/cotizaciones" className="text-sm text-muted-foreground underline">← Cotizaciones</Link>
      <h1 className="text-xl font-semibold">Nueva cotización</h1>
      <FormularioCotizacion catalogo={catalogo} clientes={clientes ?? []} />
    </section>
  );
}
