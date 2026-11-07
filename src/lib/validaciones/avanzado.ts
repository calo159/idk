import { z } from "zod";
import { zCantidad, zDia, zTexto, zUuid } from "./comunes";
import { montoTexto } from "./productos";

export const esquemaLista = z.object({
  nombre: zTexto(2, 60, "El nombre de la lista"),
  descripcion: z.string().trim().max(120).optional(),
});

export const esquemaPrecioLista = z.object({ lista_id: zUuid, producto_id: zUuid, precio: montoTexto() });

export const esquemaLote = z.object({
  producto_id: zUuid,
  bodega_id: zUuid,
  codigo: zTexto(1, 40, "El código del lote"),
  vence: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(zDia.optional()),
  cantidad: z.number({ message: "Ingresa la cantidad" }).pipe(zCantidad),
});

/** Seriales escritos uno por línea o separados por coma/espacio: normaliza, quita repetidos y valida el largo. */
export function parsearSeriales(texto: string): { seriales: string[]; repetidos: string[]; invalidos: string[] } {
  const vistos = new Set<string>();
  const repetidos: string[] = [];
  const invalidos: string[] = [];
  const seriales: string[] = [];
  for (const crudo of texto.split(/[\n,;\t]+/)) {
    const s = crudo.trim().toUpperCase();
    if (!s) continue;
    if (s.length < 3 || s.length > 64 || !/^[A-Z0-9\-_./]+$/.test(s)) {
      invalidos.push(s);
      continue;
    }
    if (vistos.has(s)) repetidos.push(s);
    else {
      vistos.add(s);
      seriales.push(s);
    }
  }
  return { seriales, repetidos, invalidos };
}

export const esquemaSeriales = z.object({
  producto_id: zUuid,
  bodega_id: zUuid,
  texto: z.string().min(1, "Escribe al menos un serial").max(20000),
});

/** Combinaciones de variantes a partir de listas de valores: tallas × colores. */
export function combinarVariantes(opciones: Record<string, string[]>): { atributos: Record<string, string> }[] {
  const entradas = Object.entries(opciones)
    .map(([k, v]) => [k, [...new Set(v.map((x) => x.trim()).filter(Boolean))]] as const)
    .filter(([, v]) => v.length > 0);
  if (entradas.length === 0) return [];
  return entradas.reduce<{ atributos: Record<string, string> }[]>(
    (acc, [clave, valores]) => acc.flatMap((a) => valores.map((v) => ({ atributos: { ...a.atributos, [clave]: v } }))),
    [{ atributos: {} }],
  );
}

/** Texto separado por comas → lista limpia. */
export const listaDesdeTexto = (t: string) => t.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);

/** Precio efectivo para un cliente: el de su lista si existe, si no el normal. */
export function precioParaCliente(precioBase: number, precioDeLista: number | undefined | null): number {
  return precioDeLista === undefined || precioDeLista === null ? precioBase : precioDeLista;
}
