import type { Metadata } from "next";
import Link from "next/link";
import { requerirContexto } from "@/lib/auth/contexto";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { sumar } from "@/lib/dinero";
import type { ProductoPOS } from "@/lib/carrito";
import { PuntoDeVenta } from "./punto-de-venta";

export const metadata: Metadata = { title: "Vender" };

export default async function Pagina({ searchParams }: { searchParams: Promise<{ cotizacion?: string; pedido?: string }> }) {
  const { cotizacion, pedido } = await searchParams;
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
      .select("id, nombre, telefono, cupo_credito, saldo, lista_precios_id")
      .eq("organizacion_id", ctx.organizacionId)
      .eq("activo", true)
      .order("nombre")
      .limit(1000),
  ]);

  const { data: preciosListas } = await supabase
    .from("precios_lista")
    .select("lista_id, producto_id, presentacion_id, precio")
    .eq("organizacion_id", ctx.organizacionId)
    .limit(50000);
  const listas: Record<string, Record<string, number>> = {};
  for (const x of preciosListas ?? []) {
    (listas[x.lista_id] ??= {})[x.presentacion_id ? `p:${x.presentacion_id}` : `b:${x.producto_id}`] = Number(x.precio);
  }

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

  // Cotización que se quiere vender: sus líneas llenan el carrito.
  let cotizacionInicial: { id: string; clienteId: string | null; lineas: { productoId: string; presentacionId: string | null; cantidad: number; precio: number; descuento: number }[] } | null = null;
  if (cotizacion) {
    const { data: cot } = await supabase
      .from("cotizaciones")
      .select("id, cliente_id, estado, vigencia_hasta, cotizaciones_detalle(producto_id, presentacion_id, cantidad, precio_unitario, descuento)")
      .eq("id", cotizacion)
      .eq("organizacion_id", ctx.organizacionId)
      .maybeSingle();
    if (cot && cot.estado === "vigente")
      cotizacionInicial = {
        id: cot.id,
        clienteId: cot.cliente_id,
        lineas: cot.cotizaciones_detalle.map((d) => ({
          productoId: d.producto_id,
          presentacionId: d.presentacion_id,
          cantidad: Number(d.cantidad),
          precio: Number(d.precio_unitario),
          descuento: Number(d.descuento),
        })),
      };
  }

  // Pedido de WhatsApp: sus líneas llenan el carrito con los precios ACTUALES (y la lista del cliente, si tiene).
  let pedidoId: string | null = null;
  if (pedido && !cotizacionInicial) {
    const { data: ped } = await supabase
      .from("pedidos_whatsapp")
      .select("id, estado, cliente_id, lineas")
      .eq("id", pedido)
      .eq("organizacion_id", ctx.organizacionId)
      .maybeSingle();
    if (ped && ped.estado === "pendiente" && Array.isArray(ped.lineas)) {
      pedidoId = ped.id;
      const cli = (clientes ?? []).find((c) => c.id === ped.cliente_id);
      const lista = cli?.lista_precios_id ? listas[cli.lista_precios_id] ?? {} : {};
      const lineasPedido = (ped.lineas as { producto_id?: string; cantidad?: number }[]).flatMap((l) => {
        const prod = catalogo.find((x) => x.id === l.producto_id);
        if (!prod || !(Number(l.cantidad) > 0)) return [];
        return [{ productoId: prod.id, presentacionId: null, cantidad: Number(l.cantidad), precio: lista[`b:${prod.id}`] ?? prod.precio, descuento: 0 }];
      });
      cotizacionInicial = { id: "", clienteId: ped.cliente_id, lineas: lineasPedido };
    }
  }

  return (
    <PuntoDeVenta
      pedidoId={pedidoId}
      cotizacionInicial={cotizacionInicial}
      bodegaId={turno.bodega_id}
      catalogo={catalogo}
      clientes={(clientes ?? []).map((c) => ({
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono,
        cupo: Number(c.cupo_credito),
        saldo: Number(c.saldo),
        listaId: c.lista_precios_id,
      }))}
      listasPrecios={listas}
      puedeAutorizarExceso={ctx.rol === "dueno" || ctx.rol === "admin"}
    />
  );
}
