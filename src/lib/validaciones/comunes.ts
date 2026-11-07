/**
 * Esquemas Zod base reutilizados por todos los módulos (CLAUDE.md: validar toda entrada).
 * Mensajes en español de Colombia.
 */
import { z } from "zod";
import Decimal from "decimal.js";
import { esDiaValido } from "@/lib/fechas";

export const zUuid = z.uuid({ message: "Identificador inválido" });

/** Texto recortado, con límites. */
export const zTexto = (min = 1, max = 200, nombre = "Este campo") =>
  z
    .string({ message: `${nombre} es obligatorio` })
    .trim()
    .min(
      min,
      min === 1 ? `${nombre} es obligatorio` : `${nombre} debe tener al menos ${min} caracteres`,
    )
    .max(max, `${nombre} no puede superar ${max} caracteres`);

export const zTextoOpcional = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `No puede superar ${max} caracteres`)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

const tieneMaxDecimales = (v: number, n: number) => new Decimal(String(v)).decimalPlaces() <= n;

/** Dinero en COP: ≥ 0, máximo 2 decimales, cabe en numeric(14,2). */
export const zMonto = z
  .number({ message: "Ingresa un valor numérico" })
  .finite("Ingresa un valor numérico")
  .min(0, "El valor no puede ser negativo")
  .max(999_999_999_999.99, "El valor es demasiado grande")
  .refine((v) => tieneMaxDecimales(v, 2), "Máximo 2 decimales");

export const zMontoPositivo = zMonto.refine((v) => v > 0, "Debe ser mayor a cero");

/** Cantidad: > 0, máximo 3 decimales, cabe en numeric(14,3). */
export const zCantidad = z
  .number({ message: "Ingresa una cantidad" })
  .finite("Ingresa una cantidad")
  .positive("La cantidad debe ser mayor a cero")
  .max(99_999_999_999.999, "La cantidad es demasiado grande")
  .refine((v) => tieneMaxDecimales(v, 3), "Máximo 3 decimales");

/** Cantidad que puede ser negativa (ajustes de inventario). Distinta de cero. */
export const zCantidadAjuste = z
  .number({ message: "Ingresa una cantidad" })
  .finite()
  .refine((v) => v !== 0, "La cantidad no puede ser cero")
  .refine((v) => Math.abs(v) <= 99_999_999_999.999, "La cantidad es demasiado grande")
  .refine((v) => tieneMaxDecimales(v, 3), "Máximo 3 decimales");

export const zPorcentaje = z
  .number({ message: "Ingresa un porcentaje" })
  .min(0, "No puede ser negativo")
  .max(100, "No puede superar 100 %")
  .refine((v) => tieneMaxDecimales(v, 2), "Máximo 2 decimales");

/** `YYYY-MM-DD` válido. */
export const zDia = z.string().refine(esDiaValido, "Fecha inválida (use AAAA-MM-DD)");

/** Celular colombiano: 10 dígitos que empiezan por 3. Se guarda normalizado (solo dígitos). */
export function normalizarCelularCO(entrada: string): string | null {
  let d = entrada.replace(/[^\d+]/g, "");
  if (d.startsWith("+57")) d = d.slice(3);
  else if (d.startsWith("0057")) d = d.slice(4);
  else if (d.length === 12 && d.startsWith("57")) d = d.slice(2);
  d = d.replace(/\D/g, "");
  return /^3\d{9}$/.test(d) ? d : null;
}

/** Formato de WhatsApp Cloud API (E.164 sin "+"): 57 + celular. */
export function celularParaWhatsApp(celularNormalizado: string): string {
  return `57${celularNormalizado}`;
}

export function formatoCelular(celularNormalizado: string): string {
  return celularNormalizado.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3");
}

export const zCelular = z.string({ message: "El celular es obligatorio" }).transform((v, ctx) => {
  const n = normalizarCelularCO(v);
  if (!n) {
    ctx.addIssue({ code: "custom", message: "Celular inválido (10 dígitos, empieza por 3)" });
    return z.NEVER;
  }
  return n;
});

export const zCelularOpcional = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === "") return undefined;
    const n = normalizarCelularCO(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Celular inválido (10 dígitos, empieza por 3)" });
      return z.NEVER;
    }
    return n;
  });

export const zCorreo = z
  .string({ message: "El correo es obligatorio" })
  .trim()
  .toLowerCase()
  .pipe(z.email("Correo inválido"));

/** NIT o cédula: 5 a 15 dígitos, con o sin guion de verificación. */
export const zDocumentoCO = z
  .string()
  .trim()
  .regex(/^\d{5,12}(-\d)?$/, "Documento inválido (solo números, ej. 900123456-7)");

export const zCodigoBarras = z
  .string()
  .trim()
  .min(4, "Código demasiado corto")
  .max(48, "Código demasiado largo")
  .regex(/^[A-Za-z0-9\-_.]+$/, "El código solo puede tener letras, números y - _ .");

export const zMetodoPago = z.enum(
  ["efectivo", "nequi", "daviplata", "transferencia", "tarjeta", "credito", "otro"],
  { message: "Método de pago inválido" },
);

export const zRol = z.enum(["dueno", "admin", "vendedor", "bodeguero", "contador", "ruta"], {
  message: "Rol inválido",
});

export const zNicho = z.enum(["ferreteria", "ropa", "viveres", "veterinaria", "general"], {
  message: "Nicho inválido",
});

/** UUID generado en el cliente para no duplicar documentos creados sin internet. */
export const zOfflineId = z.uuid({ message: "offline_id inválido" });

export const zMotivo = zTexto(3, 300, "El motivo");

/** Convierte los errores de Zod en `{ campo: "mensaje" }` para pintar en formularios. */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const i of error.issues) {
    const clave = i.path.length ? i.path.join(".") : "_";
    if (!(clave in salida)) salida[clave] = i.message;
  }
  return salida;
}

export type ResultadoAccion<T = undefined> =
  { ok: true; datos: T } | { ok: false; error: string; campos?: Record<string, string> };

export const ok = <T>(datos: T): ResultadoAccion<T> => ({ ok: true, datos });
export const fallo = (error: string, campos?: Record<string, string>): ResultadoAccion<never> => ({
  ok: false,
  error,
  campos,
});
