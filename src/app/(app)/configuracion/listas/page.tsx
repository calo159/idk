import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { EditorPrecios, FormLista } from "../../inventario/avanzado/formularios";

export const metadata: Metadata = { title: "Listas de precios" };

export default async function Pagina({ searchParams }: { searchParams: Promise<{ lista?: string }> }) {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") redirect("/configuracion");
  const { lista: elegida } = await searchParams;
  const supabase = await crearClienteServidor();
  const { data: listas } = await supabase.from("listas_precios").select("id, nombre, descripcion").eq("organizacion_id", ctx.organizacionId).eq("activa", true).order("nombre");
  const actual = (listas ?? []).find((l) => l.id === elegida) ?? (listas ?? [])[0] ?? null;

  const [{ data: productos }, { data: precios }, { data: clientes }] = actual
    ? await Promise.all([
        supabase.from("productos").select("id, nombre, precio_venta").eq("organizacion_id", ctx.organizacionId).eq("activo", true).is("variante_de", null).order("nombre").limit(3000),
        supabase.from("precios_lista").select("producto_id, precio").eq("lista_id", actual.id).is("presentacion_id", null),
        supabase.from("clientes").select("id", { count: "exact", head: false }).eq("lista_precios_id", actual.id).limit(1000),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href="/configuracion" className="text-sm text-muted-foreground underline">← Configuración</Link>
      <h1 className="text-xl font-semibold">Listas de precios</h1>
      <p className="text-sm text-muted-foreground">Cobra distinto según el tipo de cliente. Asigna la lista en la ficha del cliente y el POS usará esos precios automáticamente; lo que no tenga precio en la lista se cobra al precio normal.</p>
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Listas">
        {(listas ?? []).map((l) => (
          <Link key={l.id} href={`/configuracion/listas?lista=${l.id}`} aria-current={l.id === actual?.id ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 ${l.id === actual?.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l.nombre}</Link>
        ))}
      </nav>
      <FormLista />
      {actual ? (
        <div className="space-y-2">
          <h2 className="font-medium">{actual.nombre} <span className="text-xs font-normal text-muted-foreground">· {(clientes ?? []).length} cliente(s)</span></h2>
          <EditorPrecios
            listaId={actual.id}
            productos={(productos ?? []).map((p) => ({ id: p.id, nombre: p.nombre, precio: Number(p.precio_venta) }))}
            precios={Object.fromEntries((precios ?? []).map((p) => [p.producto_id, Number(p.precio)]))}
          />
        </div>
      ) : null}
    </section>
  );
}
