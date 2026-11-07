"use server";

import { requerirContexto } from "@/lib/auth/contexto";
import { variantesCodigo } from "@/lib/codigos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, fallo, ok } from "@/lib/validaciones/comunes";
import { zCodigoBarras } from "@/lib/validaciones/comunes";

export interface ProductoEncontrado {
  productoId: string;
  nombre: string;
  presentacionId: string | null;
  presentacionNombre: string | null;
  factor: number;
  precio: number;
  activo: boolean;
}

/** Resuelve un código escaneado a producto o presentación del negocio actual. */
export async function buscarPorCodigo(codigo: string): Promise<ResultadoAccion<ProductoEncontrado | null>> {
  const ctx = await requerirContexto();
  const valido = zCodigoBarras.safeParse(codigo);
  if (!valido.success) return fallo("Código inválido");
  const variantes = variantesCodigo(valido.data);
  const supabase = await crearClienteServidor();

  const { data: producto } = await supabase
    .from("productos")
    .select("id, nombre, precio_venta, activo")
    .eq("organizacion_id", ctx.organizacionId)
    .in("codigo_barras", variantes)
    .limit(1)
    .maybeSingle();
  if (producto)
    return ok({
      productoId: producto.id,
      nombre: producto.nombre,
      presentacionId: null,
      presentacionNombre: null,
      factor: 1,
      precio: Number(producto.precio_venta),
      activo: producto.activo,
    });

  const { data: pres } = await supabase
    .from("presentaciones")
    .select("id, nombre, factor, precio_venta, productos(id, nombre, activo)")
    .eq("organizacion_id", ctx.organizacionId)
    .in("codigo_barras", variantes)
    .limit(1)
    .maybeSingle();
  if (pres?.productos)
    return ok({
      productoId: pres.productos.id,
      nombre: pres.productos.nombre,
      presentacionId: pres.id,
      presentacionNombre: pres.nombre,
      factor: Number(pres.factor),
      precio: Number(pres.precio_venta),
      activo: pres.productos.activo,
    });

  return ok(null);
}
