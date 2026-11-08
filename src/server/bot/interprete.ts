import { z } from "zod";
import { CATEGORIAS_GASTO } from "@/lib/validaciones/gastos";

/**
 * Qué quiere el dueño. Primero se intenta con reglas (gratis y predecible); la IA solo entra si las reglas no
 * entienden. En ambos casos la salida se valida con Zod: la IA nunca ejecuta nada por sí sola.
 */
export const esquemaIntencion = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("ventas"), periodo: z.enum(["hoy", "ayer", "semana", "mes"]) }),
  z.object({ tipo: z.literal("stock"), producto: z.string().trim().min(2).max(80) }),
  z.object({ tipo: z.literal("deuda"), cliente: z.string().trim().min(2).max(80).nullish().transform((v) => v ?? null) }),
  z.object({
    tipo: z.literal("gasto"),
    monto: z.number().positive().max(999_999_999),
    categoria: z.enum(CATEGORIAS_GASTO),
    descripcion: z.string().trim().min(2).max(120),
    metodo: z.enum(["efectivo", "nequi", "daviplata", "transferencia", "tarjeta", "otro"]).default("efectivo"),
  }),
  z.object({ tipo: z.literal("confirmar") }),
  z.object({ tipo: z.literal("cancelar") }),
  z.object({ tipo: z.literal("ayuda") }),
  z.object({ tipo: z.literal("no_entendido") }),
]);
export type Intencion = z.infer<typeof esquemaIntencion>;

const sinTildes = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "45 mil", "1,5 millones", "$ 45.000", "45000", "medio millón" → pesos. null si no hay un monto claro. */
export function leerMontoColoquial(texto: string): number | null {
  const t = sinTildes(texto);
  if (/medio\s+millon/.test(t)) return 500_000;
  const m = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(millones|millon|mil|k)?/.exec(t.replace(/\$/g, " "));
  if (!m) return null;
  const crudo = m[1]!;
  const mult = m[2] === "millones" || m[2] === "millon" ? 1_000_000 : m[2] === "mil" || m[2] === "k" ? 1000 : 1;
  let n: number;
  if (/^\d{1,3}([.,]\d{3})+$/.test(crudo)) n = Number(crudo.replace(/[.,]/g, "")); // separador de miles
  else n = Number(crudo.replace(",", "."));
  const total = Math.round(n * mult);
  return Number.isFinite(total) && total > 0 ? total : null;
}

const CATEGORIA_POR_PALABRA: [RegExp, (typeof CATEGORIAS_GASTO)[number]][] = [
  [/\b(luz|energia|agua|gas|internet|telefono|servicios?)\b/, "Servicios públicos"],
  [/\b(arriendo|alquiler|canon)\b/, "Arriendo"],
  [/\b(nomina|sueldo|salario|ayudante|jornal|quincena)\b/, "Nómina y ayudas"],
  [/\b(fletes?|transporte|domicilio|gasolina|acpm|combustible|taxi|mototaxi)\b/, "Transporte y fletes"],
  [/\b(arreglo|reparacion|mantenimiento|repar\w*)\b/, "Mantenimiento"],
  [/\b(impuestos?|iva|retefuente|dian|predial)\b|camara de comercio/, "Impuestos"],
  [/\b(papeleria|aseo|escoba|cloro|resma|bolsas)\b/, "Papelería y aseo"],
  [/\b(almuerzo|comida|desayuno|refrigerio|tinto)\b/, "Alimentación"],
];

export function categoriaDesdeTexto(texto: string): (typeof CATEGORIAS_GASTO)[number] {
  const t = sinTildes(texto);
  return CATEGORIA_POR_PALABRA.find(([re]) => re.test(t))?.[1] ?? "Otros";
}

export function interpretarReglas(textoCrudo: string): Intencion {
  const texto = textoCrudo.trim();
  const t = sinTildes(texto).replace(/[¿?¡!.,;]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return { tipo: "no_entendido" };

  if (/^(si|sii+|sí|ok|dale|listo|confirmo|confirmar|de una|correcto|esta bien|yes)$/.test(t)) return { tipo: "confirmar" };
  if (/^(no|nop|cancela|cancelar|cancelo|olvidalo|mejor no|anular)$/.test(t)) return { tipo: "cancelar" };
  if (/^(ayuda|hola|menu|opciones|que puedes hacer|que haces|buenas|buenos dias|buenas tardes|buenas noches)$/.test(t)) return { tipo: "ayuda" };

  // Gastos: "gasté 45 mil en flete", "pagué la luz 120.000", "gasto de 30000 en almuerzo por nequi"
  if (/\b(gaste|gasto|pague|pago de|pagamos|compre para el negocio)\b/.test(t)) {
    const monto = leerMontoColoquial(texto);
    if (monto) {
      const metodo = /\bnequi\b/.test(t) ? "nequi" : /\bdaviplata\b/.test(t) ? "daviplata" : /\b(transferencia|pse|banco)\b/.test(t) ? "transferencia" : /\btarjeta\b/.test(t) ? "tarjeta" : "efectivo";
      // La descripción es el texto sin el monto ni las palabras de método.
      const descripcion = texto
        .replace(/\$?\s*\d[\d.,]*\s*(millones|millón|millon|mil|k)?/i, " ")
        .replace(/\b(gast[eé]|gasto|pagu[eé]|pago de|pagamos|por nequi|por daviplata|en efectivo|por transferencia|con tarjeta|de|en|la|el|los|las|un|una)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      const base = descripcion.length >= 2 ? descripcion : "Gasto";
      return { tipo: "gasto", monto, categoria: categoriaDesdeTexto(texto), descripcion: base.charAt(0).toUpperCase() + base.slice(1), metodo };
    }
  }

  // Ventas: "cuánto vendí hoy", "ventas de ayer", "cómo van las ventas del mes"
  if (/\b(vend|venta|factur|ingres)/.test(t) && !/\bdebe\b/.test(t)) {
    const periodo = /\bayer\b/.test(t) ? "ayer" : /\b(semana|7 dias)\b/.test(t) ? "semana" : /\bmes\b/.test(t) ? "mes" : "hoy";
    return { tipo: "ventas", periodo };
  }

  // Deudas: "quién me debe", "cuánto debe Pedro", "fiados"
  if (/\b(quien(es)? me debe|me deben|fiados?|cartera|por cobrar)\b/.test(t)) return { tipo: "deuda", cliente: null };
  const debe = /cuanto (te |me )?debe (?:el |la |don |dona )?(.+)$/.exec(t) ?? /deuda de (?:el |la |don |dona )?(.+)$/.exec(t);
  if (debe?.[debe.length - 1]) return { tipo: "deuda", cliente: debe[debe.length - 1]!.trim().slice(0, 80) };

  // Stock: "cuánto cemento hay", "stock de martillo", "inventario de alambre"
  const stock = /(?:stock|inventario|existencias?) (?:de |del |de la )?(.+)$/.exec(t) ?? /cuant[oa]s? (.+?) (?:hay|me quedan|quedan|tengo|tenemos)$/.exec(t) ?? /cuant[oa]s? (?:hay|me quedan|quedan|tengo|tenemos) (?:de |del |de la )(.+)$/.exec(t);
  if (stock?.[1] && stock[1].length >= 2) return { tipo: "stock", producto: stock[1].trim().slice(0, 80) };

  return { tipo: "no_entendido" };
}

export const TEXTO_AYUDA = [
  "Puedo ayudarte con:",
  "• *Ventas*: «cuánto vendí hoy», «ventas de ayer», «ventas del mes»",
  "• *Inventario*: «stock de cemento», «cuántos martillos hay»",
  "• *Deudas*: «quién me debe», «cuánto debe Pedro»",
  "• *Gastos*: «gasté 45 mil en flete» (te pido confirmación antes de guardarlo)",
].join("\n");
