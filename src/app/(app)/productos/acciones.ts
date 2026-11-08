"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { paraBd, cantidadParaBd } from "@/lib/dinero";
import { puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import {
  type ResultadoAccion,
  erroresPorCampo,
  fallo,
  ok,
  zUuid,
} from "@/lib/validaciones/comunes";
import {
  esquemaCategoria,
  esquemaPresentacion,
  esquemaProducto,
  mensajeErrorProducto,
  validarFoto,
} from "@/lib/validaciones/productos";

/**
 * PostgREST acepta strings para numeric (sin perder decimales), pero los tipos generados dicen number.
 * Enviamos el string de `paraBd`/`cantidadParaBd` (D-003) y lo declaramos aquí, en un solo lugar.
 */
const numericoBd = (v: string) => v as unknown as number;

function textos(f: FormData, campos: string[]): Record<string, string> {
  return Object.fromEntries(campos.map((c) => [c, String(f.get(c) ?? "")]));
}

const CAMPOS_PRODUCTO = [
  "nombre",
  "sku",
  "codigo_barras",
  "categoria_id",
  "descripcion",
  "unidad_base",
  "precio_venta",
  "margen_objetivo",
  "stock_minimo",
  "iva_pct",
];

/** Crea (sin `id`) o edita (con `id`) un producto. Sube la foto si viene una. */
export async function guardarProducto(
  _prev: ResultadoAccion | null,
  f: FormData,
): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "productos")) return fallo("No tienes permiso para editar productos");

  const r = esquemaProducto.safeParse({
    ...textos(f, CAMPOS_PRODUCTO),
    maneja_inventario: f.get("maneja_inventario") === "on",
  });
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));

  const idCrudo = String(f.get("id") ?? "");
  const id = idCrudo ? zUuid.safeParse(idCrudo) : null;
  if (id && !id.success) return fallo("Producto inválido");

  const foto = f.get("foto");
  let fotoUrl: string | undefined;
  const supabase = await crearClienteServidor();
  if (foto instanceof File && foto.size > 0) {
    const problema = validarFoto(foto);
    if (problema) return fallo(problema, { foto: problema });
    const ext = foto.type === "image/png" ? "png" : foto.type === "image/webp" ? "webp" : "jpg";
    const ruta = `${ctx.organizacionId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("productos")
      .upload(ruta, foto, { contentType: foto.type });
    if (error) return fallo("No pudimos subir la foto");
    fotoUrl = ruta;
  }

  const fila = {
    nombre: r.data.nombre,
    sku: r.data.sku ?? null,
    codigo_barras: r.data.codigo_barras ?? null,
    categoria_id: r.data.categoria_id ?? null,
    descripcion: r.data.descripcion ?? null,
    unidad_base: r.data.unidad_base,
    precio_venta: numericoBd(paraBd(r.data.precio_venta)),
    margen_objetivo: r.data.margen_objetivo === undefined ? null : numericoBd(paraBd(r.data.margen_objetivo)),
    stock_minimo: numericoBd(cantidadParaBd(r.data.stock_minimo)),
    maneja_inventario: r.data.maneja_inventario,
    iva_pct: Number(r.data.iva_pct),
    ...(fotoUrl ? { foto_url: fotoUrl } : {}),
  };

  let destino: string;
  if (id?.success) {
    const { error } = await supabase
      .from("productos")
      .update(fila)
      .eq("id", id.data)
      .eq("organizacion_id", ctx.organizacionId);
    if (error) return fallo(mensajeErrorProducto(error.message));
    destino = `/productos/${id.data}`;
  } else {
    const { data, error } = await supabase
      .from("productos")
      .insert({ ...fila, organizacion_id: ctx.organizacionId })
      .select("id")
      .single();
    if (error || !data) return fallo(mensajeErrorProducto(error?.message ?? ""));
    destino = `/productos/${data.id}`;
  }
  revalidatePath("/productos");
  redirect(destino);
}

/** Activa o desactiva (los productos no se borran: tienen historial). */
export async function activarProducto(productoId: string, activo: boolean): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "productos")) return fallo("No tienes permiso");
  const id = zUuid.safeParse(productoId);
  if (!id.success) return fallo("Producto inválido");
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("productos")
    .update({ activo })
    .eq("id", id.data)
    .eq("organizacion_id", ctx.organizacionId);
  if (error) return fallo(mensajeErrorProducto(error.message));
  revalidatePath("/productos");
  revalidatePath(`/productos/${id.data}`);
  return ok(undefined);
}

export async function guardarPresentacion(
  _prev: ResultadoAccion | null,
  f: FormData,
): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "presentaciones")) return fallo("No tienes permiso");
  const r = esquemaPresentacion.safeParse(
    textos(f, ["producto_id", "nombre", "factor", "codigo_barras", "precio_venta"]),
  );
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("presentaciones").insert({
    organizacion_id: ctx.organizacionId,
    producto_id: r.data.producto_id,
    nombre: r.data.nombre,
    factor: numericoBd(cantidadParaBd(r.data.factor)),
    codigo_barras: r.data.codigo_barras ?? null,
    precio_venta: numericoBd(paraBd(r.data.precio_venta)),
  });
  if (error) return fallo(mensajeErrorProducto(error.message));
  revalidatePath(`/productos/${r.data.producto_id}`);
  return ok(undefined);
}

export async function eliminarPresentacion(
  presentacionId: string,
  productoId: string,
): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "presentaciones")) return fallo("No tienes permiso");
  const id = zUuid.safeParse(presentacionId);
  if (!id.success) return fallo("Presentación inválida");
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("presentaciones")
    .delete()
    .eq("id", id.data)
    .eq("organizacion_id", ctx.organizacionId);
  if (error)
    return fallo("Esta presentación ya se usó en documentos; no se puede borrar.");
  revalidatePath(`/productos/${productoId}`);
  return ok(undefined);
}

export async function crearCategoria(
  _prev: ResultadoAccion | null,
  f: FormData,
): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "categorias")) return fallo("No tienes permiso");
  const r = esquemaCategoria.safeParse(textos(f, ["nombre"]));
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("categorias")
    .insert({ organizacion_id: ctx.organizacionId, nombre: r.data.nombre });
  if (error) return fallo(mensajeErrorProducto(error.message));
  revalidatePath("/productos");
  return ok(undefined);
}
