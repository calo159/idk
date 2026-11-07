import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cargarCatalogoSelector } from "@/server/catalogo";
import { FormularioSeparado } from "./formulario";

export const metadata: Metadata = { title: "Nuevo separado" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "ventas.confirmar") || !ctx.bodegaId) redirect("/ventas/separados");
  const supabase = await crearClienteServidor();
  const [catalogo, { data: clientes }, { data: turno }] = await Promise.all([
    cargarCatalogoSelector(supabase, ctx.organizacionId),
    supabase.from("clientes").select("id, nombre").eq("organizacion_id", ctx.organizacionId).eq("activo", true).order("nombre").limit(1000),
    supabase.from("turnos_caja").select("bodega_id").eq("organizacion_id", ctx.organizacionId).eq("usuario_id", ctx.usuarioId).eq("estado", "abierto").maybeSingle(),
  ]);
  if ((clientes ?? []).length === 0) {
    return (
      <section className="mx-auto max-w-md space-y-3 px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">Un separado necesita un cliente. Crea uno primero.</p>
        <Link href="/clientes/nuevo" className="text-primary underline">Nuevo cliente</Link>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <Link href="/ventas/separados" className="text-sm text-muted-foreground underline">← Separados</Link>
      <h1 className="text-xl font-semibold">Nuevo separado</h1>
      <FormularioSeparado catalogo={catalogo} clientes={clientes ?? []} bodegaId={turno?.bodega_id ?? ctx.bodegaId} />
    </section>
  );
}
