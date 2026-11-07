import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FormularioOrden } from "./formulario-orden";

export const metadata: Metadata = { title: "Nueva orden de compra" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "compras.confirmar")) redirect("/compras");
  const supabase = await crearClienteServidor();
  const [{ data: proveedores }, { data: bodegas }, { data: productos }] = await Promise.all([
    supabase.from("proveedores").select("id, nombre").eq("organizacion_id", ctx.organizacionId).eq("activo", true).order("nombre"),
    supabase.from("bodegas").select("id, nombre").eq("organizacion_id", ctx.organizacionId).eq("activa", true).order("es_principal", { ascending: false }),
    supabase.from("productos").select("id, nombre, unidad_base, existencias(costo_promedio)").eq("organizacion_id", ctx.organizacionId).eq("activo", true).eq("maneja_inventario", true).order("nombre").limit(3000),
  ]);
  if ((proveedores ?? []).length === 0) {
    return (
      <section className="mx-auto max-w-md space-y-3 px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">Primero crea un proveedor.</p>
        <Link href="/proveedores" className="text-primary underline">Ir a Proveedores</Link>
      </section>
    );
  }
  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <Link href="/compras/ordenes" className="text-sm text-muted-foreground underline">← Órdenes de compra</Link>
      <h1 className="text-xl font-semibold">Nueva orden de compra</h1>
      <FormularioOrden
        proveedores={proveedores ?? []}
        bodegas={bodegas ?? []}
        productos={(productos ?? []).map((p) => ({
          id: p.id, nombre: p.nombre, unidad: p.unidad_base,
          costo: Number(p.existencias.find((e) => Number(e.costo_promedio) > 0)?.costo_promedio ?? 0),
        }))}
      />
    </section>
  );
}
