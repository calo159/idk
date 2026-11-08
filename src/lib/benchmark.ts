import { z } from "zod";
import { formatoCOP } from "@/lib/dinero";

/** Una razón del negocio frente a su grupo. Los números del grupo son agregados (percentiles), nunca de un negocio en particular. */
const esquemaRazon = z.object({
  tuyo: z.coerce.number(),
  p25: z.coerce.number(),
  mediana: z.coerce.number(),
  p75: z.coerce.number(),
  por_debajo: z.coerce.number(),
  por_encima: z.coerce.number(),
});
export type Razon = z.infer<typeof esquemaRazon>;

export const esquemaBenchmark = z.discriminatedUnion("compartiendo", [
  z.object({ compartiendo: z.literal(false), nicho: z.string() }),
  z.object({
    compartiendo: z.literal(true),
    nicho: z.string(),
    sin_datos_propios: z.boolean().optional(),
    cohorte_insuficiente: z.boolean().optional(),
    negocios: z.coerce.number().optional(),
    razones: z.record(z.string(), esquemaRazon).optional(),
  }),
]);
export type Benchmark = z.infer<typeof esquemaBenchmark>;

export type ClaveMedida = "margen" | "rotacion" | "vencido" | "perdidas" | "ticket";
export interface Medida {
  clave: ClaveMedida;
  etiqueta: string;
  /** Qué es mejor: más alto, más bajo, o ninguno (solo informa). */
  mejor: "alto" | "bajo" | null;
  formato: (n: number) => string;
}

const num1 = (n: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(n);

export const MEDIDAS: Medida[] = [
  { clave: "margen", etiqueta: "Margen de ganancia", mejor: "alto", formato: (n) => `${num1(n)} %` },
  { clave: "rotacion", etiqueta: "Días de inventario", mejor: "bajo", formato: (n) => `${Math.round(n)} días` },
  { clave: "vencido", etiqueta: "Deuda vencida (% de lo vendido)", mejor: "bajo", formato: (n) => `${num1(n)} %` },
  { clave: "perdidas", etiqueta: "Pérdidas (% de lo vendido)", mejor: "bajo", formato: (n) => `${num1(n)} %` },
  { clave: "ticket", etiqueta: "Venta promedio", mejor: null, formato: (n) => formatoCOP(n) },
];

export type Tono = "bien" | "regular" | "mal" | "neutral";

/** En qué lugar quedas. Compara solo con quienes tienen un valor estrictamente peor, así un empate no infla el resultado. */
export function posicion(m: Medida, r: Razon): { texto: string; tono: Tono } {
  if (m.mejor === null) {
    const arriba = Math.round(r.por_debajo * 100);
    return { texto: arriba >= 50 ? `Vendes más por venta que el ${arriba} % del grupo` : `El ${Math.round(r.por_encima * 100)} % del grupo vende más por venta`, tono: "neutral" };
  }
  const superados = m.mejor === "alto" ? r.por_debajo : r.por_encima;
  const pct = Math.round(superados * 100);
  if (superados >= 0.66) return { texto: `Mejor que el ${pct} % de los negocios del grupo`, tono: "bien" };
  if (superados >= 0.34) return { texto: "Cerca del promedio del grupo", tono: "regular" };
  return { texto: pct === 0 ? "Por debajo de casi todo el grupo" : `Solo mejor que el ${pct} % del grupo`, tono: "mal" };
}

export const ETIQUETA_NICHO: Record<string, string> = {
  ferreteria: "ferreterías",
  ropa: "tiendas de ropa",
  viveres: "tiendas de víveres",
  veterinaria: "veterinarias",
  general: "negocios",
};
