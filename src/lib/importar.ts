import { z } from "zod";
import { leerNumeroCO } from "@/lib/dinero";
import { normalizarTexto } from "@/lib/validaciones/ia";
import { UNIDADES } from "@/lib/validaciones/productos";

/** Importación de productos desde Excel/CSV desordenado. La IA propone el mapeo; la persona lo confirma. */

export const CAMPOS_IMPORTACION = [
  { clave: "nombre", etiqueta: "Nombre del producto", obligatorio: true },
  { clave: "precio_venta", etiqueta: "Precio de venta", obligatorio: false },
  { clave: "costo", etiqueta: "Costo", obligatorio: false },
  { clave: "cantidad", etiqueta: "Cantidad en stock", obligatorio: false },
  { clave: "codigo_barras", etiqueta: "Código de barras", obligatorio: false },
  { clave: "sku", etiqueta: "SKU / referencia", obligatorio: false },
  { clave: "categoria", etiqueta: "Categoría", obligatorio: false },
  { clave: "unidad", etiqueta: "Unidad", obligatorio: false },
  { clave: "stock_minimo", etiqueta: "Stock mínimo", obligatorio: false },
] as const;
export type CampoImportacion = (typeof CAMPOS_IMPORTACION)[number]["clave"];

/** campo → índice de columna (o null si no hay). */
export type Mapeo = Record<CampoImportacion, number | null>;

export const mapeoVacio = (): Mapeo =>
  Object.fromEntries(CAMPOS_IMPORTACION.map((c) => [c.clave, null])) as Mapeo;

/** Esquema del mapeo, también para validar lo que devuelve la IA. */
const columna = z.number().int().min(0).max(200).nullable().catch(null);
export const esquemaMapeo = z.object({
  nombre: columna,
  precio_venta: columna,
  costo: columna,
  cantidad: columna,
  codigo_barras: columna,
  sku: columna,
  categoria: columna,
  unidad: columna,
  stock_minimo: columna,
});

const SINONIMOS: Record<CampoImportacion, string[]> = {
  nombre: ["nombre", "producto", "descripcion", "articulo", "item", "detalle", "denominacion"],
  precio_venta: ["precio venta", "precio de venta", "pvp", "precio publico", "precio", "valor venta", "venta"],
  costo: ["costo", "precio compra", "precio de compra", "valor compra", "compra", "costo unitario"],
  cantidad: ["cantidad", "stock", "existencia", "existencias", "inventario", "unidades", "cant", "saldo"],
  codigo_barras: ["codigo de barras", "codigo barras", "barras", "ean", "upc", "cod barras"],
  sku: ["sku", "referencia", "ref", "codigo", "cod", "codigo interno"],
  categoria: ["categoria", "grupo", "linea", "familia", "tipo", "rubro"],
  unidad: ["unidad", "und", "medida", "um", "unidad de medida"],
  stock_minimo: ["stock minimo", "minimo", "stock min", "punto de pedido", "reorden"],
};

/**
 * Mapeo por nombre de columna, sin IA. Cada columna se usa para un solo campo, y se prefiere la
 * coincidencia exacta sobre la parcial ("precio venta" gana sobre "precio").
 */
export function mapeoHeuristico(encabezados: (string | null | undefined)[]): Mapeo {
  const mapeo = mapeoVacio();
  const usadas = new Set<number>();
  const norm = encabezados.map((h) => normalizarTexto(String(h ?? "")));

  const asignar = (campo: CampoImportacion, coincide: (h: string, s: string) => boolean) => {
    if (mapeo[campo] !== null) return;
    for (const sin of SINONIMOS[campo]) {
      const i = norm.findIndex((h, idx) => !usadas.has(idx) && h !== "" && coincide(h, sin));
      if (i >= 0) {
        mapeo[campo] = i;
        usadas.add(i);
        return;
      }
    }
  };
  // Primero exactas, luego "contiene". Campos más específicos antes que los genéricos.
  const orden: CampoImportacion[] = [
    "codigo_barras", "stock_minimo", "precio_venta", "costo", "categoria", "unidad", "cantidad", "sku", "nombre",
  ];
  for (const c of orden) asignar(c, (h, s) => h === s);
  for (const c of orden) asignar(c, (h, s) => h.includes(s));
  return mapeo;
}

/** Fusiona el mapeo de la IA con el heurístico: lo que la IA dejó vacío o repetido lo completa el heurístico. */
export function combinarMapeos(ia: Mapeo | null, heuristico: Mapeo, numColumnas: number): Mapeo {
  const base = ia ?? heuristico;
  const final = mapeoVacio();
  const usadas = new Set<number>();
  for (const c of CAMPOS_IMPORTACION) {
    const candidato = [base[c.clave], heuristico[c.clave]].find(
      (i): i is number => i !== null && i < numColumnas && !usadas.has(i),
    );
    if (candidato !== undefined) {
      final[c.clave] = candidato;
      usadas.add(candidato);
    }
  }
  return final;
}

export interface FilaProducto {
  /** Número de fila en el archivo (1 = primera fila de datos tras el encabezado). */
  fila: number;
  nombre: string;
  precio_venta: number;
  costo: number;
  cantidad: number;
  codigo_barras: string | null;
  sku: string | null;
  categoria: string | null;
  unidad: string;
  stock_minimo: number;
}

export interface ErrorFila {
  fila: number;
  mensaje: string;
}

export interface ResultadoLectura {
  validas: FilaProducto[];
  errores: ErrorFila[];
  /** Filas descartadas por repetir código de barras / SKU / nombre dentro del mismo archivo. */
  repetidas: ErrorFila[];
}

const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

function numero(v: unknown): number | null | "invalido" {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : "invalido";
  const n = leerNumeroCO(String(v));
  return n === null ? "invalido" : n.toNumber();
}

function unidadValida(v: string): string {
  const n = normalizarTexto(v);
  const alias: Record<string, string> = {
    und: "unidad", unid: "unidad", unidades: "unidad", u: "unidad", mt: "metro", mts: "metro", metros: "metro", m: "metro",
    kg: "kilo", kgs: "kilo", kilos: "kilo", lt: "litro", lts: "litro", litros: "litro", gr: "gramo", gramos: "gramo",
    cajas: "caja", paquetes: "paquete", paq: "paquete", pares: "par", docenas: "docena", bolsas: "bolsa", rollos: "rollo",
  };
  const u = alias[n] ?? n;
  return (UNIDADES as readonly string[]).includes(u) ? u : "unidad";
}

/** Convierte filas crudas en productos válidos, reportando cada problema con su número de fila. */
export function leerFilas(filas: unknown[][], mapeo: Mapeo): ResultadoLectura {
  const validas: FilaProducto[] = [];
  const errores: ErrorFila[] = [];
  const repetidas: ErrorFila[] = [];
  const vistos = new Set<string>();
  const celda = (fila: unknown[], c: CampoImportacion) => (mapeo[c] === null ? undefined : fila[mapeo[c]!]);

  filas.forEach((f, idx) => {
    const n = idx + 1;
    if (f.every((c) => texto(c) === "")) return; // fila vacía
    const nombre = texto(celda(f, "nombre"));
    if (!nombre) return void errores.push({ fila: n, mensaje: "Falta el nombre" });
    if (nombre.length > 120) return void errores.push({ fila: n, mensaje: "El nombre supera 120 caracteres" });

    const leidos: Partial<Record<CampoImportacion, number>> = {};
    for (const c of ["precio_venta", "costo", "cantidad", "stock_minimo"] as const) {
      const v = numero(celda(f, c));
      if (v === "invalido") return void errores.push({ fila: n, mensaje: `"${c.replace("_", " ")}" no es un número` });
      if (v !== null && v < 0 && c !== "cantidad") return void errores.push({ fila: n, mensaje: `"${c.replace("_", " ")}" no puede ser negativo` });
      if (v !== null) leidos[c] = v;
    }
    if ((leidos.cantidad ?? 0) < 0) return void errores.push({ fila: n, mensaje: "La cantidad no puede ser negativa" });
    if (Math.max(leidos.precio_venta ?? 0, leidos.costo ?? 0) > 999_999_999_999)
      return void errores.push({ fila: n, mensaje: "Valor demasiado grande" });

    const barras = texto(celda(f, "codigo_barras")).replace(/\.0$/, "");
    if (barras && !/^[A-Za-z0-9\-_.]{4,48}$/.test(barras))
      return void errores.push({ fila: n, mensaje: "Código de barras inválido" });
    const sku = texto(celda(f, "sku")).slice(0, 40);

    const clave = barras ? `b:${barras}` : sku ? `s:${normalizarTexto(sku)}` : `n:${normalizarTexto(nombre)}`;
    if (vistos.has(clave)) return void repetidas.push({ fila: n, mensaje: "Repetido en el archivo" });
    vistos.add(clave);

    validas.push({
      fila: n,
      nombre,
      precio_venta: leidos.precio_venta ?? 0,
      costo: leidos.costo ?? 0,
      cantidad: leidos.cantidad ?? 0,
      codigo_barras: barras || null,
      sku: sku || null,
      categoria: texto(celda(f, "categoria")).slice(0, 60) || null,
      unidad: unidadValida(texto(celda(f, "unidad"))),
      stock_minimo: leidos.stock_minimo ?? 0,
    });
  });
  return { validas, errores, repetidas };
}

/** Detecta la fila de encabezados: la primera fila (de las primeras 10) con más celdas de texto no numéricas. */
export function detectarEncabezado(filas: unknown[][]): number {
  let mejor = 0;
  let puntaje = -1;
  filas.slice(0, 10).forEach((f, i) => {
    const p = f.filter((c) => texto(c) !== "" && numero(c) === "invalido").length;
    if (p > puntaje) {
      puntaje = p;
      mejor = i;
    }
  });
  return mejor;
}
