import { z } from "zod";

/**
 * Salida de la IA al leer una factura de proveedor. TODO lo que devuelve el modelo se valida aquí
 * antes de tocar la interfaz: la IA propone, la persona confirma.
 */

const numeroIA = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const n = typeof v === "number" ? v : Number(v.replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: "custom", message: "Número inválido" });
    return z.NEVER;
  }
  return n;
});

export const esquemaLineaFacturaIA = z.object({
  descripcion: z.string().trim().min(1).max(200),
  codigo: z
    .string()
    .trim()
    .max(48)
    .nullish()
    .transform((v) => (v ? v : null)),
  cantidad: numeroIA.pipe(z.number().positive().max(99_999_999)),
  /** Costo unitario SIN formato (ej. 12500), en pesos colombianos. */
  costo_unitario: numeroIA.pipe(z.number().min(0).max(999_999_999)),
});

export const esquemaFacturaIA = z.object({
  proveedor: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((v) => (v ? v : null)),
  nit: z
    .string()
    .trim()
    .max(20)
    .nullish()
    .transform((v) => (v ? v : null)),
  numero_factura: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => (v ? v : null)),
  /** AAAA-MM-DD o null si no se ve. */
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .transform((v) => v ?? null),
  total: numeroIA.nullish().transform((v) => v ?? null),
  lineas: z.array(esquemaLineaFacturaIA).max(300),
  /** 0–1: qué tan legible estaba la foto según el modelo. */
  confianza: numeroIA.pipe(z.number().min(0).max(1)).catch(0.5),
  advertencias: z.array(z.string().max(200)).max(10).catch([]),
});
export type FacturaIA = z.infer<typeof esquemaFacturaIA>;
export type LineaFacturaIA = z.infer<typeof esquemaLineaFacturaIA>;

/** JSON Schema de la herramienta que fuerza la salida estructurada del modelo. */
export const HERRAMIENTA_FACTURA = {
  name: "registrar_factura",
  description:
    "Registra los datos leídos de una factura de compra de un proveedor colombiano. Usa null cuando un dato no se vea; nunca inventes.",
  input_schema: {
    type: "object" as const,
    properties: {
      proveedor: { type: ["string", "null"], description: "Razón social o nombre del proveedor" },
      nit: { type: ["string", "null"], description: "NIT del proveedor, ej. 900123456-7" },
      numero_factura: { type: ["string", "null"] },
      fecha: { type: ["string", "null"], description: "AAAA-MM-DD" },
      total: { type: ["number", "null"], description: "Total de la factura en COP, sin separadores" },
      lineas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descripcion: { type: "string" },
            codigo: { type: ["string", "null"], description: "Código o referencia del producto si aparece" },
            cantidad: { type: "number" },
            costo_unitario: {
              type: "number",
              description: "Precio unitario antes de IVA en COP, sin separadores de miles",
            },
          },
          required: ["descripcion", "cantidad", "costo_unitario"],
        },
      },
      confianza: { type: "number", description: "0 a 1: legibilidad de la foto" },
      advertencias: { type: "array", items: { type: "string" } },
    },
    required: ["lineas", "confianza"],
  },
};

// ---------------------------------------------------------------------------
// Emparejar líneas leídas con el catálogo
// ---------------------------------------------------------------------------

export interface ProductoCatalogo {
  id: string;
  nombre: string;
  codigo_barras: string | null;
  sku: string | null;
}

export interface LineaEmparejada extends LineaFacturaIA {
  productoId: string | null;
  /** 1 = código exacto, 0.5–0.99 = parecido por nombre. */
  similitud: number;
}

export function normalizarTexto(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Similitud por palabras (Jaccard sobre tokens de ≥ 2 caracteres). */
export function similitudNombres(a: string, b: string): number {
  const ta = new Set(normalizarTexto(a).split(" ").filter((x) => x.length >= 2));
  const tb = new Set(normalizarTexto(b).split(" ").filter((x) => x.length >= 2));
  if (!ta.size || !tb.size) return 0;
  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes++;
  return comunes / (ta.size + tb.size - comunes);
}

const UMBRAL_NOMBRE = 0.6;

export function emparejarLineas(lineas: LineaFacturaIA[], catalogo: ProductoCatalogo[]): LineaEmparejada[] {
  return lineas.map((l) => {
    if (l.codigo) {
      const c = l.codigo.toLowerCase();
      const exacto = catalogo.find(
        (p) => p.codigo_barras?.toLowerCase() === c || p.sku?.toLowerCase() === c,
      );
      if (exacto) return { ...l, productoId: exacto.id, similitud: 1 };
    }
    let mejor: { id: string; s: number } | null = null;
    let empate = false;
    for (const p of catalogo) {
      const s = similitudNombres(l.descripcion, p.nombre);
      if (!mejor || s > mejor.s) {
        mejor = { id: p.id, s };
        empate = false;
      } else if (s === mejor.s) empate = true;
    }
    // Un empate no se resuelve solo: que lo elija la persona.
    if (mejor && mejor.s >= UMBRAL_NOMBRE && !empate)
      return { ...l, productoId: mejor.id, similitud: Math.round(mejor.s * 100) / 100 };
    return { ...l, productoId: null, similitud: 0 };
  });
}
