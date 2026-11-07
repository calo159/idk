import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { Badge } from "@/components/ui/badge";
import { formatoCantidad, formatoCOP } from "@/lib/dinero";
import { puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { zUuid } from "@/lib/validaciones/comunes";
import { FormVariantes } from "../../inventario/avanzado/formularios";
import {
  BotonActivarProducto,
  BotonEliminarPresentacion,
  FormPresentacion,
  FormProducto,
} from "../formularios";

export const metadata: Metadata = { title: "Producto" };

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requerirContexto();
  const { id } = await params;
  if (!zUuid.safeParse(id).success) notFound();
  const supabase = await crearClienteServidor();

  const [{ data: producto }, { data: categorias }, { data: presentaciones }, { data: existencias }] =
    await Promise.all([
      supabase
        .from("productos")
        .select("*")
        .eq("id", id)
        .eq("organizacion_id", ctx.organizacionId)
        .maybeSingle(),
      supabase.from("categorias").select("id, nombre").eq("organizacion_id", ctx.organizacionId).order("nombre"),
      supabase
        .from("presentaciones")
        .select("id, nombre, factor, codigo_barras, precio_venta")
        .eq("producto_id", id)
        .order("factor"),
      supabase.from("existencias").select("cantidad, costo_promedio").eq("producto_id", id),
    ]);
  if (!producto) notFound();

  const editar = puedeEscribir(ctx.rol, "productos");
  const total = (existencias ?? []).reduce((s, e) => s + Number(e.cantidad), 0);

  return (
    <section className="mx-auto max-w-xl space-y-5 px-4 py-6">
      <Link href="/productos" className="text-sm text-muted-foreground underline">
        ← Productos
      </Link>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{producto.nombre}</h1>
          <p className="text-sm text-muted-foreground">
            {producto.maneja_inventario
              ? `En stock: ${formatoCantidad(total)} ${producto.unidad_base}`
              : "Servicio (sin inventario)"}
            {" · "}
            {formatoCOP(producto.precio_venta)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!producto.activo ? <Badge variant="secondary">Inactivo</Badge> : null}
          {editar ? <BotonActivarProducto productoId={producto.id} activo={producto.activo} /> : null}
        </div>
      </header>

      <div className="space-y-2">
        <h2 className="font-medium">Presentaciones</h2>
        {(presentaciones ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Solo se vende por {producto.unidad_base}. Agrega cajas, paquetes o rollos si aplica.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {(presentaciones ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1">
                  {p.nombre}{" "}
                  <span className="text-muted-foreground">
                    ({formatoCantidad(p.factor)} {producto.unidad_base})
                  </span>
                </span>
                <span className="font-medium tabular-nums">{formatoCOP(p.precio_venta)}</span>
                {editar ? (
                  <BotonEliminarPresentacion presentacionId={p.id} productoId={producto.id} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {editar ? <FormPresentacion productoId={producto.id} /> : null}
      </div>

      {editar && !producto.variante_de ? <FormVariantes productoId={producto.id} /> : null}
      {producto.atributos ? <p className="text-xs text-muted-foreground">Variante: {Object.values(producto.atributos as Record<string, string>).join(" / ")}</p> : null}

      {editar ? (
        <div className="space-y-3">
          <h2 className="font-medium">Editar producto</h2>
          <FormProducto producto={producto} categorias={categorias ?? []} />
        </div>
      ) : null}
    </section>
  );
}
