import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FormProducto } from "../formularios";

export const metadata: Metadata = { title: "Nuevo producto" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "productos")) redirect("/productos");
  const supabase = await crearClienteServidor();
  const { data: categorias } = await supabase
    .from("categorias")
    .select("id, nombre")
    .eq("organizacion_id", ctx.organizacionId)
    .order("nombre");
  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <Link href="/productos" className="text-sm text-muted-foreground underline">
        ← Productos
      </Link>
      <h1 className="text-xl font-semibold">Nuevo producto</h1>
      <FormProducto categorias={categorias ?? []} />
    </section>
  );
}
