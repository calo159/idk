"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { cantidadParaBd, paraBd } from "@/lib/dinero";
import { puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { normalizarTexto } from "@/lib/validaciones/ia";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zCodigoBarras, zMonto, zUuid } from "@/lib/validaciones/comunes";
import { UNIDADES } from "@/lib/validaciones/productos";

const numericoBd = (v: string) => v as unknown as number;

const esquemaFila = z.object({
  nombre: z.string().trim().min(1).max(120),
  precio_venta: zMonto,
  costo: zMonto,
  cantidad: z.number().min(0).max(99_999_999_999),
  codigo_barras: zCodigoBarras.nullable(),
  sku: z.string().trim().max(40).nullable(),
  categoria: z.string().trim().max(60).nullable(),
  unidad: z.enum(UNIDADES),
  stock_minimo: z.number().min(0).max(99_999_999_999),
});

const esquemaImportacion = z.object({
  bodega_id: zUuid,
  filas: z.array(esquemaFila).min(1, "No hay productos para importar").max(2000, "Máximo 2.000 productos por archivo"),
});

export interface ResumenImportacion {
  creados: number;
  omitidos: number;
  conStock: number;
  categoriasNuevas: number;
}

/**
 * Crea los productos y su inventario inicial. Omite lo que ya existe (mismo código de barras, SKU o nombre).
 * El stock entra por `cargar_inventario_inicial` (movimientos), nunca editando existencias.
 */
export async function importarProductos(entrada: unknown): Promise<ResultadoAccion<ResumenImportacion>> {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "productos")) return fallo("No tienes permiso para importar productos");
  const r = esquemaImportacion.safeParse(entrada);
  if (!r.success) return fallo("El archivo tiene datos inválidos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();

  const [{ data: existentes }, { data: categorias }] = await Promise.all([
    supabase.from("productos").select("nombre, sku, codigo_barras").eq("organizacion_id", ctx.organizacionId).limit(50000),
    supabase.from("categorias").select("id, nombre").eq("organizacion_id", ctx.organizacionId),
  ]);
  const yaBarras = new Set((existentes ?? []).map((p) => p.codigo_barras).filter(Boolean));
  const yaSku = new Set((existentes ?? []).map((p) => p.sku && normalizarTexto(p.sku)).filter(Boolean));
  const yaNombre = new Set((existentes ?? []).map((p) => normalizarTexto(p.nombre)));

  const nuevas = r.data.filas.filter((f) => {
    if (f.codigo_barras && yaBarras.has(f.codigo_barras)) return false;
    if (f.sku && yaSku.has(normalizarTexto(f.sku))) return false;
    return !yaNombre.has(normalizarTexto(f.nombre));
  });
  if (nuevas.length === 0) return ok({ creados: 0, omitidos: r.data.filas.length, conStock: 0, categoriasNuevas: 0 });

  // Categorías que faltan.
  const idCategoria = new Map((categorias ?? []).map((c) => [normalizarTexto(c.nombre), c.id]));
  const faltantes = [...new Set(nuevas.map((f) => f.categoria).filter((c): c is string => !!c))].filter(
    (c) => !idCategoria.has(normalizarTexto(c)),
  );
  let categoriasNuevas = 0;
  if (faltantes.length) {
    const { data: creadas, error } = await supabase
      .from("categorias")
      .insert(faltantes.map((nombre) => ({ organizacion_id: ctx.organizacionId, nombre })))
      .select("id, nombre");
    if (error) return fallo("No pudimos crear las categorías");
    for (const c of creadas ?? []) idCategoria.set(normalizarTexto(c.nombre), c.id);
    categoriasNuevas = creadas?.length ?? 0;
  }

  // Productos con id propio para enlazar el stock inicial sin ambigüedad.
  const filas = nuevas.map((f) => ({ ...f, id: crypto.randomUUID() }));
  for (let i = 0; i < filas.length; i += 200) {
    const { error } = await supabase.from("productos").insert(
      filas.slice(i, i + 200).map((f) => ({
        id: f.id,
        organizacion_id: ctx.organizacionId,
        nombre: f.nombre,
        sku: f.sku,
        codigo_barras: f.codigo_barras,
        categoria_id: f.categoria ? (idCategoria.get(normalizarTexto(f.categoria)) ?? null) : null,
        unidad_base: f.unidad,
        precio_venta: numericoBd(paraBd(f.precio_venta)),
        stock_minimo: numericoBd(cantidadParaBd(f.stock_minimo)),
      })),
    );
    if (error) {
      // Lo ya insertado no se borra (los productos no se eliminan); se informa para reintentar.
      return fallo(
        `Se detuvo en el producto ${i + 1}: ${
          /unique|duplicate/i.test(error.message) ? "hay un código o SKU repetido" : "error al guardar"
        }. Lo anterior sí quedó creado; vuelve a importar el archivo y se omitirá lo ya cargado.`,
      );
    }
  }

  const conStock = filas.filter((f) => f.cantidad > 0);
  if (conStock.length) {
    const { error } = await supabase.rpc("cargar_inventario_inicial", {
      p_org: ctx.organizacionId,
      p_bodega: r.data.bodega_id,
      p_lineas: conStock.map((f) => ({ producto_id: f.id, cantidad: f.cantidad, costo: f.costo })),
    });
    if (error)
      return fallo(
        "Los productos se crearon, pero no se pudo cargar el inventario inicial. Ajusta el stock desde Inventario.",
      );
  }

  revalidatePath("/productos");
  revalidatePath("/inventario");
  return ok({
    creados: filas.length,
    omitidos: r.data.filas.length - filas.length,
    conStock: conStock.length,
    categoriasNuevas,
  });
}
