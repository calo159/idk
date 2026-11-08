import { z } from "zod";
import { leerNumeroCO } from "@/lib/dinero";
import { zCodigoBarras, zMonto, zPorcentaje, zTexto, zTextoOpcional, zUuid } from "./comunes";

/** Número escrito por una persona ("12.500", "$ 12.500,50") → number validado por `esquema`. */
function desdeTexto(esquema: z.ZodType<number, number>, vacioEs?: number) {
  return z
    .string()
    .transform((v, ctx) => {
      if (v.trim() === "") {
        if (vacioEs !== undefined) return vacioEs;
        ctx.addIssue({ code: "custom", message: "Ingresa un valor numérico" });
        return z.NEVER;
      }
      const n = leerNumeroCO(v);
      if (n === null) {
        ctx.addIssue({ code: "custom", message: "Ingresa un valor numérico" });
        return z.NEVER;
      }
      return n.toNumber();
    })
    .pipe(esquema);
}

export const montoTexto = (vacioEs?: number) => desdeTexto(zMonto, vacioEs);
export const porcentajeTexto = desdeTexto(zPorcentaje);

/** Cantidad ≥ 0 con 3 decimales (stock mínimo); vacío = 0. */
const zCantidadNoNegativa = z
  .number()
  .min(0, "No puede ser negativa")
  .max(99_999_999_999.999, "Demasiado grande")
  .refine((v) => Number.isInteger(Math.round(v * 1000)) && Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, "Máximo 3 decimales");

const codigoOpcional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .pipe(zCodigoBarras.optional());

export const UNIDADES = [
  "unidad",
  "metro",
  "kilo",
  "gramo",
  "litro",
  "caja",
  "paquete",
  "par",
  "docena",
  "bolsa",
  "rollo",
] as const;

export const esquemaProducto = z.object({
  nombre: zTexto(2, 120, "El nombre"),
  sku: z
    .string()
    .trim()
    .max(40, "El SKU no puede superar 40 caracteres")
    .transform((v) => (v === "" ? undefined : v)),
  codigo_barras: codigoOpcional,
  categoria_id: z
    .string()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(zUuid.optional()),
  descripcion: zTextoOpcional(500),
  unidad_base: z.enum(UNIDADES, { message: "Elige una unidad" }),
  precio_venta: montoTexto(0),
  margen_objetivo: z
    .string()
    .transform((v) => (v.trim() === "" ? undefined : v))
    .pipe(porcentajeTexto.optional()),
  stock_minimo: desdeTexto(zCantidadNoNegativa, 0),
  maneja_inventario: z.boolean(),
  /** IVA incluido en el precio de venta (para la factura electrónica). */
  iva_pct: z
    .string()
    .optional()
    .transform((v) => (v ? v : "0"))
    .pipe(z.enum(["0", "5", "19"], { message: "Elige el IVA del producto" })),
});
export type DatosProducto = z.infer<typeof esquemaProducto>;

export const esquemaPresentacion = z.object({
  producto_id: zUuid,
  nombre: zTexto(1, 60, "El nombre"),
  factor: desdeTexto(
    z
      .number()
      .positive("El factor debe ser mayor a cero")
      .max(99_999_999_999.999)
      .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, "Máximo 3 decimales"),
  ),
  codigo_barras: codigoOpcional,
  precio_venta: montoTexto(),
});
export type DatosPresentacion = z.infer<typeof esquemaPresentacion>;

export const esquemaCategoria = z.object({
  nombre: zTexto(2, 60, "El nombre de la categoría"),
});

/** Foto de producto: solo imágenes pequeñas. */
export const FOTO_MAX_BYTES = 3 * 1024 * 1024;
export const FOTO_TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;

export function validarFoto(f: { type: string; size: number }): string | null {
  if (!(FOTO_TIPOS as readonly string[]).includes(f.type)) return "La foto debe ser JPG, PNG o WebP";
  if (f.size > FOTO_MAX_BYTES) return "La foto no puede pesar más de 3 MB";
  return null;
}

/** Traduce errores de unicidad de Postgres a mensajes claros. */
export function mensajeErrorProducto(mensaje: string): string {
  if (mensaje.includes("productos_organizacion_id_sku_key")) return "Ya existe un producto con ese SKU";
  if (mensaje.includes("productos_organizacion_id_codigo_barras_key"))
    return "Ya existe un producto con ese código de barras";
  if (mensaje.includes("presentaciones_organizacion_id_codigo_barras_key"))
    return "Ya existe una presentación con ese código de barras";
  if (mensaje.includes("categorias_organizacion_id_nombre_key")) return "Ya existe esa categoría";
  if (mensaje.includes("row-level security")) return "No tienes permiso para esta operación";
  return "No pudimos guardar. Intenta de nuevo.";
}
