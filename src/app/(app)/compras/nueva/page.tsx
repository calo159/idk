import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { hoyBogota } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FormularioCompra } from "./formulario-compra";

export const metadata: Metadata = { title: "Nueva compra" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "compras.confirmar")) redirect("/compras");
  const supabase = await crearClienteServidor();
  const [{ data: productos }, { data: proveedores }, { data: bodegas }] = await Promise.all([
    supabase
      .from("productos")
      .select("id, nombre, unidad_base, codigo_barras, presentaciones(id, nombre, factor, codigo_barras)")
      .eq("organizacion_id", ctx.organizacionId)
      .eq("activo", true)
      .eq("maneja_inventario", true)
      .order("nombre")
      .limit(2000),
    supabase
      .from("proveedores")
      .select("id, nombre")
      .eq("organizacion_id", ctx.organizacionId)
      .eq("activo", true)
      .order("nombre"),
    supabase
      .from("bodegas")
      .select("id, nombre")
      .eq("organizacion_id", ctx.organizacionId)
      .eq("activa", true)
      .order("es_principal", { ascending: false }),
  ]);
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href="/compras" className="text-sm text-muted-foreground underline">
        ← Compras
      </Link>
      <h1 className="text-xl font-semibold">Nueva compra</h1>
      <FormularioCompra
        productos={(productos ?? []).map((p) => ({
          ...p,
          presentaciones: p.presentaciones.map((x) => ({ ...x, factor: Number(x.factor) })),
        }))}
        proveedores={proveedores ?? []}
        bodegas={bodegas ?? []}
        hoy={hoyBogota()}
      />
    </section>
  );
}
