import type { Metadata } from "next";
import Link from "next/link";
import { requerirContexto } from "@/lib/auth/contexto";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { sumar } from "@/lib/dinero";
import type { ProductoPOS } from "@/lib/carrito";
import { PuntoDeVenta } from "./punto-de-venta";

export const metadata: Metadata = { title: "Vender" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "ventas.confirmar")) {
    return (
      <p className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">
        Tu rol no puede registrar ventas.
      </p>
    );
  }
  const supabase = await crearClienteServidor();
  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id, bodega_id")
    .eq("organizacion_id", ctx.organizacionId)
    .eq("usuario_id", ctx.usuarioId)
    .eq("estado", "abierto")
    .maybeSingle();

  if (!turno) {
    return (
      <section className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Abre tu caja para vender</h1>
        <p className="text-sm text-muted-foreground">
          Cada venta queda en un turno de caja para que al final del día cuadre el efectivo.
        </p>
        <Link href="/caja" className="inline-block rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          Ir a Caja
        </Link>
      </section>
    );
  }

  const [{ data: productos }, { data: clientes }] = await Promise.all([
    supabase
      .from("productos")
      .select(
        "id, nombre, unidad_base, precio_venta, codigo_barras, sku, maneja_inventario, presentaciones(id, nombre, factor, precio_venta, codigo_barras), existencias(bodega_id, cantidad)",
      )
      .eq("organizacion_id", ctx.organizacionId)
      .eq("activo", true)
      .order("nombre")
      .limit(3000),
    supabase
      .from("clientes")
      .select("id, nombre, telefono, cupo_credito, saldo")
      .eq("organizacion_id", ctx.organizacionId)
      .eq("activo", true)
      .order("nombre")
      .limit(1000),
  ]);

  const catalogo: ProductoPOS[] = (productos ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    unidad: p.unidad_base,
    precio: Number(p.precio_venta),
    codigo: p.codigo_barras,
    sku: p.sku,
    controlaStock: p.maneja_inventario,
    stock: Number(sumar(...p.existencias.filter((e) => e.bodega_id === turno.bodega_id).map((e) => e.cantidad))),
    presentaciones: p.presentaciones.map((x) => ({
      id: x.id,
      nombre: x.nombre,
      factor: Number(x.factor),
      precio: Number(x.precio_venta),
      codigo: x.codigo_barras,
    })),
  }));

  return (
    <PuntoDeVenta
      bodegaId={turno.bodega_id}
      catalogo={catalogo}
      clientes={(clientes ?? []).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono,
        cupo: Number(c.cupo_credito),
        saldo: Number(c.saldo),
      }))}
      puedeAutorizarExceso={ctx.rol === "dueno" || ctx.rol === "admin"}
    />
  );
}
