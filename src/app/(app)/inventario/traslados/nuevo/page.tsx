import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FormularioTraslado } from "./formulario-traslado";

export const metadata: Metadata = { title: "Nuevo traslado" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "inventario.ajustar")) redirect("/inventario");
  const supabase = await crearClienteServidor();
  const [{ data: bodegas }, { data: productos }] = await Promise.all([
    supabase.from("bodegas").select("id, nombre").eq("organizacion_id", ctx.organizacionId).eq("activa", true).order("es_principal", { ascending: false }),
    supabase.from("productos").select("id, nombre, unidad_base, existencias(bodega_id, cantidad)").eq("organizacion_id", ctx.organizacionId).eq("activo", true).eq("maneja_inventario", true).order("nombre").limit(3000),
  ]);
  if ((bodegas ?? []).length < 2) {
    return (
      <section className="mx-auto max-w-md space-y-3 px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">Necesitas al menos dos bodegas para hacer un traslado.</p>
        <Link href="/configuracion/bodegas" className="text-primary underline">Crear una bodega</Link>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <Link href="/inventario/traslados" className="text-sm text-muted-foreground underline">← Traslados</Link>
      <h1 className="text-xl font-semibold">Nuevo traslado</h1>
      <FormularioTraslado
        bodegas={bodegas ?? []}
        productos={(productos ?? []).map((p) => ({
          id: p.id,
          nombre: p.nombre,
          unidad: p.unidad_base,
          stock: Object.fromEntries(p.existencias.map((e) => [e.bodega_id, Number(e.cantidad)])),
        }))}
      />
    </section>
  );
}
