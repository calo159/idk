import { z } from "zod";
import { dinero, formatoCOP } from "@/lib/dinero";

/** Medidas crudas de los últimos 30 días que entrega `metricas_salud` (el puntaje se calcula aquí, no en la base de datos). */
export const esquemaMetricas = z.object({
  desde: z.string(),
  hasta: z.string(),
  ventas_n: z.coerce.number(),
  ventas_netas: z.coerce.number(),
  utilidad: z.coerce.number(),
  costo_ventas: z.coerce.number(),
  inventario_valor: z.coerce.number(),
  vencido: z.coerce.number(),
  por_cobrar: z.coerce.number(),
  merma: z.coerce.number(),
  faltantes_caja: z.coerce.number(),
});
export type Metricas = z.infer<typeof esquemaMetricas>;

export const esquemaRespuestaSalud = z.object({
  actual: esquemaMetricas,
  anterior: z.object({ fecha: z.string(), metricas: esquemaMetricas }).nullable(),
});

export type ClaveComponente = "margen" | "rotacion" | "cartera" | "perdidas";

export interface Componente {
  clave: ClaveComponente;
  etiqueta: string;
  /** 0–100, o null si todavía no hay datos para medirlo. */
  puntaje: number | null;
  peso: number;
  /** Frase corta con la cifra que explica el puntaje. */
  detalle: string;
  /** Qué hacer (vacío si va bien). */
  consejo: string;
  href: string | null;
}

export type Nivel = "excelente" | "bien" | "atencion" | "critico";

export interface Salud {
  puntaje: number | null;
  nivel: Nivel | null;
  componentes: Componente[];
}

export const PESOS: Record<ClaveComponente, number> = { margen: 30, rotacion: 25, cartera: 25, perdidas: 20 };

/** Metas: con ellas el componente vale 100 puntos o 0. */
export const METAS = {
  margenBueno: 0.3, // 30 % de margen sobre la venta = 100 puntos
  margenMalo: 0.05, // 5 % o menos = 0 puntos
  diasInventarioBueno: 30,
  diasInventarioMalo: 180,
  vencidoMalo: 0.5, // deuda vencida equivalente al 50 % de lo vendido en el mes = 0 puntos
  perdidasMalo: 0.03, // pérdidas del 3 % de las ventas = 0 puntos
};

const limitar = (n: number) => Math.round(Math.min(100, Math.max(0, n)));
const pct = (n: number) => `${(Math.round(n * 1000) / 10).toString().replace(".", ",")} %`;

export function nivelDe(puntaje: number): Nivel {
  return puntaje >= 80 ? "excelente" : puntaje >= 60 ? "bien" : puntaje >= 40 ? "atencion" : "critico";
}

export const ETIQUETA_NIVEL: Record<Nivel, string> = { excelente: "Excelente", bien: "Bien", atencion: "Atención", critico: "Crítico" };

export function calcularSalud(m: Metricas): Salud {
  const ventas = dinero(m.ventas_netas);
  const hayVentas = ventas.gt(0);

  // Margen
  let margen: Componente;
  if (!hayVentas) {
    margen = { clave: "margen", etiqueta: "Margen de ganancia", puntaje: null, peso: PESOS.margen, detalle: "Sin ventas en los últimos 30 días", consejo: "", href: null };
  } else {
    const mg = dinero(m.utilidad).div(ventas).toNumber();
    const p = limitar(((mg - METAS.margenMalo) / (METAS.margenBueno - METAS.margenMalo)) * 100);
    margen = {
      clave: "margen", etiqueta: "Margen de ganancia", puntaje: p, peso: PESOS.margen,
      detalle: `Ganas ${pct(mg)} de lo que vendes`,
      consejo: p >= 80 ? "" : "Tu margen es bajo. Revisa los precios sugeridos por margen objetivo y los productos que vendes casi al costo.",
      href: p >= 80 ? null : "/productos/precios",
    };
  }

  // Rotación del inventario
  let rotacion: Componente;
  const inv = dinero(m.inventario_valor);
  if (!inv.gt(0)) {
    rotacion = { clave: "rotacion", etiqueta: "Rotación del inventario", puntaje: null, peso: PESOS.rotacion, detalle: "No hay inventario valorizado", consejo: "", href: null };
  } else if (!dinero(m.costo_ventas).gt(0)) {
    rotacion = {
      clave: "rotacion", etiqueta: "Rotación del inventario", puntaje: 0, peso: PESOS.rotacion,
      detalle: `Tienes ${formatoCOP(inv)} en mercancía y no se vendió nada este mes`,
      consejo: "Tu mercancía no se está moviendo. Mira la plata dormida y haz una promoción.", href: "/productos/promociones",
    };
  } else {
    const dias = inv.div(dinero(m.costo_ventas).div(30)).toNumber();
    const p = limitar(((METAS.diasInventarioMalo - dias) / (METAS.diasInventarioMalo - METAS.diasInventarioBueno)) * 100);
    rotacion = {
      clave: "rotacion", etiqueta: "Rotación del inventario", puntaje: p, peso: PESOS.rotacion,
      detalle: `Tu inventario alcanza para ${Math.round(dias)} días de venta (${formatoCOP(inv)} invertidos)`,
      consejo: p >= 80 ? "" : "Hay demasiada plata parada en mercancía. Compra menos de lo que rota despacio y liquida lo viejo.",
      href: p >= 80 ? null : "/productos/promociones",
    };
  }

  // Cartera
  let cartera: Componente;
  const vencido = dinero(m.vencido);
  if (vencido.lte(0)) {
    cartera = { clave: "cartera", etiqueta: "Cartera (fiados)", puntaje: 100, peso: PESOS.cartera, detalle: "Nadie te debe vencido", consejo: "", href: null };
  } else if (!hayVentas) {
    cartera = { clave: "cartera", etiqueta: "Cartera (fiados)", puntaje: 0, peso: PESOS.cartera, detalle: `Tienes ${formatoCOP(vencido)} vencido y sin ventas este mes`, consejo: "Cobra primero: revisa quién debe y envía los recordatorios.", href: "/clientes?deuda=1" };
  } else {
    const r = vencido.div(ventas).toNumber();
    const p = limitar((1 - r / METAS.vencidoMalo) * 100);
    cartera = {
      clave: "cartera", etiqueta: "Cartera (fiados)", puntaje: p, peso: PESOS.cartera,
      detalle: `${formatoCOP(vencido)} vencido (${pct(r)} de lo que vendiste)`,
      consejo: p >= 80 ? "" : "Tienes mucha plata en la calle. Cobra a los más atrasados y no fíes a quienes ya tienen mora.",
      href: "/clientes?deuda=1",
    };
  }

  // Pérdidas
  let perdidas: Componente;
  if (!hayVentas) {
    perdidas = { clave: "perdidas", etiqueta: "Pérdidas", puntaje: null, peso: PESOS.perdidas, detalle: "Sin ventas para comparar", consejo: "", href: null };
  } else {
    const total = dinero(m.merma).plus(dinero(m.faltantes_caja));
    const r = total.div(ventas).toNumber();
    const p = limitar((1 - r / METAS.perdidasMalo) * 100);
    perdidas = {
      clave: "perdidas", etiqueta: "Pérdidas", puntaje: p, peso: PESOS.perdidas,
      detalle: total.isZero() ? "Sin mermas ni faltantes de caja" : `${formatoCOP(total)} entre mercancía dada de baja y faltantes de caja (${pct(r)} de las ventas)`,
      consejo: p >= 80 ? "" : "Revisa los ajustes de inventario y los cierres de caja con faltante: ahí se está yendo plata.",
      href: p >= 80 ? null : "/reportes",
    };
  }

  const componentes = [margen, rotacion, cartera, perdidas];
  const medidos = componentes.filter((c): c is Componente & { puntaje: number } => c.puntaje !== null);
  if (medidos.length === 0) return { puntaje: null, nivel: null, componentes };
  const peso = medidos.reduce((t, c) => t + c.peso, 0);
  const puntaje = Math.round(medidos.reduce((t, c) => t + c.puntaje * c.peso, 0) / peso);
  return { puntaje, nivel: nivelDe(puntaje), componentes };
}

/** Diferencia de puntos con la foto de hace ~30 días (null si no hay con qué comparar). */
export function tendencia(actual: Salud, anterior: Salud | null): number | null {
  if (!anterior || actual.puntaje === null || anterior.puntaje === null) return null;
  return actual.puntaje - anterior.puntaje;
}

/** El componente más flojo que además tiene algo que hacer: es la recomendación principal. */
export function prioridad(s: Salud): Componente | null {
  const flojos = s.componentes.filter((c) => c.puntaje !== null && c.puntaje < 80 && c.consejo);
  if (flojos.length === 0) return null;
  // Pesa más un componente flojo importante: se prioriza por «puntos que se podrían ganar».
  return [...flojos].sort((a, b) => (100 - b.puntaje!) * b.peso - (100 - a.puntaje!) * a.peso)[0]!;
}
