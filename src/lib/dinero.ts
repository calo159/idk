/**
 * Dinero y cantidades.
 *
 * Reglas (CLAUDE.md #3 y #4):
 *  - Pesos colombianos (COP) con 2 decimales, igual que numeric(14,2) en la base de datos.
 *  - Cantidades con 3 decimales, igual que numeric(14,3).
 *  - Nunca se suman `number` sueltos: todo cálculo pasa por Decimal y se redondea como Postgres
 *    (mitad hacia afuera de cero).
 */
import Decimal from "decimal.js";

/** Redondeo igual al de `round()` de Postgres sobre numeric. */
const Dec = Decimal.clone({ rounding: Decimal.ROUND_HALF_UP, precision: 40 });
export type Valor = Decimal.Value | null | undefined;
export type Monto = InstanceType<typeof Dec>;

export const DECIMALES_DINERO = 2;
export const DECIMALES_CANTIDAD = 3;
/** Máximo de numeric(14,2) / numeric(14,3): 12 y 11 dígitos enteros. */
export const MAX_DINERO = new Dec("999999999999.99");
export const MAX_CANTIDAD = new Dec("99999999999.999");

function aDecimal(v: Valor): Monto {
  if (v === null || v === undefined || v === "") return new Dec(0);
  if (v instanceof Decimal) return new Dec(v.toString());
  const d = new Dec(typeof v === "number" ? String(v) : v);
  if (!d.isFinite()) throw new RangeError(`Valor numérico inválido: ${String(v)}`);
  return d;
}

/** Convierte cualquier valor (number de PostgREST, string de la UI) a pesos con 2 decimales. */
export function dinero(v: Valor): Monto {
  return aDecimal(v).toDecimalPlaces(DECIMALES_DINERO, Dec.ROUND_HALF_UP);
}

/** Convierte a cantidad con 3 decimales. */
export function cantidad(v: Valor): Monto {
  return aDecimal(v).toDecimalPlaces(DECIMALES_CANTIDAD, Dec.ROUND_HALF_UP);
}

export function sumar(...valores: Valor[]): Monto {
  return dinero(valores.reduce<Monto>((acc, v) => acc.plus(aDecimal(v)), new Dec(0)));
}

export function restar(a: Valor, b: Valor): Monto {
  return dinero(aDecimal(a).minus(aDecimal(b)));
}

/** round(cantidad * precio, 2): igual que la columna generada `subtotal` de compras_detalle. */
export function multiplicar(precio: Valor, cant: Valor): Monto {
  return dinero(aDecimal(precio).times(aDecimal(cant)));
}

/** round(cantidad * precio_unitario - descuento, 2): igual que ventas_detalle.subtotal. */
export function subtotalLinea(cant: Valor, precioUnitario: Valor, descuento: Valor = 0): Monto {
  return dinero(aDecimal(cant).times(aDecimal(precioUnitario)).minus(aDecimal(descuento)));
}

/** Porcentaje de `base` (ej. 19 % de IVA). */
export function porcentaje(base: Valor, pct: Valor): Monto {
  return dinero(aDecimal(base).times(aDecimal(pct)).div(100));
}

/** Utilidad = ingreso - costo. */
export function utilidad(ingreso: Valor, costo: Valor): Monto {
  return restar(ingreso, costo);
}

/** Margen sobre venta en % (utilidad / ingreso). 0 si no hay ingreso. */
export function margenSobreVenta(ingreso: Valor, costo: Valor): Monto {
  const i = aDecimal(ingreso);
  if (i.isZero()) return new Dec(0);
  return i.minus(aDecimal(costo)).div(i).times(100).toDecimalPlaces(2, Dec.ROUND_HALF_UP);
}

/** Precio a partir de un costo y un margen objetivo sobre venta (%). */
export function precioPorMargen(costo: Valor, margenPct: Valor): Monto {
  const m = aDecimal(margenPct);
  if (m.gte(100)) throw new RangeError("El margen debe ser menor a 100 %");
  return dinero(aDecimal(costo).div(new Dec(1).minus(m.div(100))));
}

export function descuentoPorcentaje(base: Valor, pct: Valor): Monto {
  return porcentaje(base, pct);
}

/** Vuelto al cliente. Nunca negativo: si falta plata devuelve 0. */
export function vuelto(recibido: Valor, total: Valor): Monto {
  const r = restar(recibido, total);
  return r.isNegative() ? new Dec(0) : r;
}

/**
 * Costo promedio ponderado (CLAUDE.md / 02-ARQUITECTURA): replica EXACTA del trigger
 * `aplicar_movimiento`. Si no había stock positivo, el costo nuevo es el de la entrada.
 */
export function costoPromedioPonderado(
  stockActual: Valor,
  costoActual: Valor,
  cantidadEntrada: Valor,
  costoEntrada: Valor,
): Monto {
  const stock = aDecimal(stockActual);
  const entra = aDecimal(cantidadEntrada);
  const costoIn = dinero(costoEntrada);
  if (costoIn.lte(0)) return dinero(costoActual);
  if (stock.lte(0)) return costoIn;
  const nuevaCant = stock.plus(entra);
  return dinero(stock.times(aDecimal(costoActual)).plus(entra.times(costoIn)).div(nuevaCant));
}

/** Reparte `total` en partes iguales sin perder ni crear centavos. */
export function repartir(total: Valor, partes: number): Monto[] {
  if (!Number.isInteger(partes) || partes < 1)
    throw new RangeError("partes debe ser un entero ≥ 1");
  return prorratear(total, Array<number>(partes).fill(1));
}

/**
 * Reparte `total` proporcionalmente a `pesos` (ej. descuento global entre líneas) y garantiza que la
 * suma de las partes sea exactamente `total` (el residuo va a las partes con mayor fracción).
 */
export function prorratear(total: Valor, pesos: Valor[]): Monto[] {
  const t = dinero(total);
  const w = pesos.map(aDecimal);
  const suma = w.reduce<Monto>((a, x) => a.plus(x), new Dec(0));
  if (w.length === 0) return [];
  if (suma.isZero()) throw new RangeError("La suma de pesos no puede ser 0");
  const centavos = t.times(100);
  const exactas = w.map((x) => centavos.times(x).div(suma));
  const bases = exactas.map((x) => x.floor());
  let resto = centavos.minus(bases.reduce<Monto>((a, x) => a.plus(x), new Dec(0))).toNumber();
  const orden = exactas
    .map((x, i) => ({ i, frac: x.minus(bases[i]!) }))
    .sort((a, b) => b.frac.comparedTo(a.frac) || a.i - b.i);
  for (const { i } of orden) {
    if (resto <= 0) break;
    bases[i] = bases[i]!.plus(1);
    resto -= 1;
  }
  return bases.map((c) => c.div(100));
}

// ---------------------------------------------------------------------------
// Presentación y lectura
// ---------------------------------------------------------------------------

function agrupar(enteros: string): string {
  return enteros.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Formato colombiano: `$ 12.500`. Los centavos solo se muestran si existen (`$ 12.500,50`).
 * Independiente del ICU del navegador para que servidor y cliente generen el mismo texto.
 */
export function formatoCOP(
  v: Valor,
  opciones: { simbolo?: boolean; decimales?: boolean } = {},
): string {
  const { simbolo = true, decimales } = opciones;
  const d = dinero(v);
  const neg = d.isNegative() && !d.isZero();
  const [ent = "0", frac = ""] = d.abs().toFixed(2).split(".");
  const conDecimales = decimales ?? frac !== "00";
  const cuerpo = agrupar(ent) + (conDecimales ? `,${frac}` : "");
  return `${neg ? "-" : ""}${simbolo ? "$ " : ""}${cuerpo}`;
}

/** Formato corto para tarjetas del dashboard: `$ 1,2 M`, `$ 350 mil`. */
export function formatoCOPCorto(v: Valor): string {
  const d = dinero(v);
  const abs = d.abs();
  const signo = d.isNegative() && !d.isZero() ? "-" : "";
  const fmt = (x: Monto, sufijo: string) =>
    `${signo}$ ${x.toDecimalPlaces(1, Dec.ROUND_HALF_UP).toString().replace(".", ",")}${sufijo}`;
  if (abs.gte(1_000_000_000)) return fmt(abs.div(1_000_000_000), " mil M");
  if (abs.gte(1_000_000)) return fmt(abs.div(1_000_000), " M");
  if (abs.gte(10_000)) return fmt(abs.div(1_000).toDecimalPlaces(0, Dec.ROUND_HALF_UP), " mil");
  return formatoCOP(d, { decimales: false });
}

/** Cantidades: `12`, `2,5`, `0,125` (sin ceros sobrantes), con separador de miles. */
export function formatoCantidad(v: Valor): string {
  const d = cantidad(v);
  const neg = d.isNegative() && !d.isZero();
  const [ent = "0", frac = ""] = d.abs().toFixed(3).split(".");
  const fracLimpia = frac.replace(/0+$/, "");
  return `${neg ? "-" : ""}${agrupar(ent)}${fracLimpia ? `,${fracLimpia}` : ""}`;
}

/**
 * Lee lo que escribe una persona en un campo de dinero o cantidad.
 * Acepta "12500", "12.500", "$ 12.500", "12.500,50", "12,5". Devuelve null si no es un número.
 * Punto = miles (si va seguido de 3 dígitos), coma = decimales.
 */
export function leerNumeroCO(texto: string): Monto | null {
  let t = texto.trim().replace(/[$\s]/g, "");
  if (t === "") return null;
  let negativo = false;
  if (t.startsWith("-")) {
    negativo = true;
    t = t.slice(1);
  }
  if (!/^[\d.,]+$/.test(t)) return null;

  let entero: string;
  let frac = "";
  if (t.includes(",")) {
    const partes = t.split(",");
    if (partes.length !== 2) return null;
    entero = partes[0]!.replace(/\./g, "");
    frac = partes[1]!;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    entero = t.replace(/\./g, "");
  } else if (/^\d+\.\d{1,2}$/.test(t) || /^\d+\.\d{1,3}$/.test(t)) {
    [entero = "", frac = ""] = t.split(".");
  } else if (/^\d+$/.test(t)) {
    entero = t;
  } else {
    return null;
  }
  if (!/^\d+$/.test(entero) || (frac !== "" && !/^\d+$/.test(frac))) return null;
  const d = new Dec(`${entero}${frac ? `.${frac}` : ""}`);
  return negativo ? d.neg() : d;
}

/** Valor para enviar a Postgres: string con 2 decimales, sin notación científica. */
export function paraBd(v: Valor): string {
  return dinero(v).toFixed(2);
}

export function cantidadParaBd(v: Valor): string {
  return cantidad(v).toFixed(3);
}

/** Atajo para escribir tests y datos: `$(12500)` */
export const $ = dinero;
