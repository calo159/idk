import { z } from "zod";
import { sumar } from "@/lib/dinero";
import { sumarDias } from "@/lib/fechas";

/**
 * Todo el acceso a datos del asistente pasa por aquí. La implementación real usa la sesión del usuario (RLS y roles
 * de las funciones SQL); las pruebas usan un repositorio falso. Son SOLO lecturas: el asistente no puede cambiar nada.
 */
export interface RepoAsistente {
  ventasDiarias(desde: string, hasta: string): Promise<{ dia: string; ventas: number; total: number; costo: number; utilidad: number }[]>;
  ventasProducto(desde: string, hasta: string): Promise<{ nombre: string; cantidad: number; ingreso: number; utilidad: number }[]>;
  ventasMetodo(desde: string, hasta: string): Promise<{ metodo: string; pagos: number; total: number }[]>;
  ventasVendedor(desde: string, hasta: string): Promise<{ nombre: string; ventas: number; total: number; utilidad: number }[]>;
  buscarProductos(texto: string): Promise<{ nombre: string; unidad: string; stock: number; precio: number }[]>;
  deudas(cliente: string | null): Promise<{ nombre: string; saldo: number; vencido: number; dias_mora: number }[]>;
  plataDormida(dias: number): Promise<{ nombre: string; cantidad: number; valor: number; dias_sin_vender: number | null }[]>;
}

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");
const zRango = z.object({ desde: zDia, hasta: zDia }).refine((r) => r.hasta >= r.desde, "La fecha final es anterior a la inicial")
  .refine((r) => (Date.parse(r.hasta) - Date.parse(r.desde)) / 86_400_000 <= 366, "El rango máximo es de un año");

const esquemas = {
  ventas_por_periodo: zRango,
  productos_mas_vendidos: z.object({
    desde: zDia, hasta: zDia,
    ordenar_por: z.enum(["ingreso", "utilidad", "cantidad"]).default("ingreso"),
    limite: z.number().int().min(1).max(15).default(5),
  }),
  ventas_por_metodo_pago: zRango,
  ventas_por_vendedor: zRango,
  stock_de_producto: z.object({ texto: z.string().trim().min(2).max(80) }),
  deudas_de_clientes: z.object({ cliente: z.string().trim().max(80).nullish() }),
  plata_dormida: z.object({ dias: z.number().int().min(30).max(365).default(60) }),
} as const;

export type NombreHerramienta = keyof typeof esquemas;

const fechas = {
  desde: { type: "string", description: "Fecha inicial AAAA-MM-DD (hora de Colombia)" },
  hasta: { type: "string", description: "Fecha final AAAA-MM-DD, inclusive" },
};

/** Definición para la API de Claude (tool use). Los esquemas Zod de arriba son los que realmente validan. */
export const DEFINICIONES = [
  { name: "ventas_por_periodo", description: "Ventas totales, utilidad y costo en un rango de fechas, con el detalle por día si el rango es de hasta 31 días.", input_schema: { type: "object" as const, properties: fechas, required: ["desde", "hasta"] } },
  { name: "productos_mas_vendidos", description: "Productos más vendidos en un rango, ordenados por ingreso, utilidad o cantidad. Úsala para «más vendido» y «más rentable».", input_schema: { type: "object" as const, properties: { ...fechas, ordenar_por: { type: "string", enum: ["ingreso", "utilidad", "cantidad"] }, limite: { type: "integer", minimum: 1, maximum: 15 } }, required: ["desde", "hasta"] } },
  { name: "ventas_por_metodo_pago", description: "Cuánto se cobró por efectivo, Nequi, Daviplata, transferencia, tarjeta y fiado en un rango.", input_schema: { type: "object" as const, properties: fechas, required: ["desde", "hasta"] } },
  { name: "ventas_por_vendedor", description: "Ventas y utilidad de cada vendedor en un rango.", input_schema: { type: "object" as const, properties: fechas, required: ["desde", "hasta"] } },
  { name: "stock_de_producto", description: "Existencias y precio de los productos cuyo nombre se parece al texto.", input_schema: { type: "object" as const, properties: { texto: { type: "string" } }, required: ["texto"] } },
  { name: "deudas_de_clientes", description: "Cuánto deben los clientes. Con `cliente` busca por nombre; sin él devuelve el total y los mayores deudores.", input_schema: { type: "object" as const, properties: { cliente: { type: ["string", "null"] } } } },
  { name: "plata_dormida", description: "Mercancía parada: productos sin venderse en N días y el dinero que tienen inmovilizado.", input_schema: { type: "object" as const, properties: { dias: { type: "integer", minimum: 30, maximum: 365 } } } },
];

export const NOMBRES_HERRAMIENTAS = Object.keys(esquemas) as NombreHerramienta[];

const num = (n: number) => Math.round(n * 100) / 100;

/** Ejecuta una herramienta con entrada ya validada. Devuelve datos pequeños y ya sumados (el modelo no hace cuentas). */
export async function ejecutarHerramienta(repo: RepoAsistente, nombre: string, entrada: unknown): Promise<unknown> {
  if (!NOMBRES_HERRAMIENTAS.includes(nombre as NombreHerramienta)) return { error: "Herramienta desconocida" };
  const n = nombre as NombreHerramienta;
  const parsed = esquemas[n].safeParse(entrada);
  if (!parsed.success) return { error: `Entrada inválida: ${parsed.error.issues[0]?.message ?? "revisa los datos"}` };
  const e = parsed.data as Record<string, never>;
  try {
    switch (n) {
      case "ventas_por_periodo": {
        const dias = await repo.ventasDiarias(e.desde, e.hasta);
        const total = sumar(...dias.map((d) => d.total));
        const utilidad = sumar(...dias.map((d) => d.utilidad));
        const largo = (Date.parse(e.hasta) - Date.parse(e.desde)) / 86_400_000 + 1;
        return {
          desde: e.desde, hasta: e.hasta, ventas: dias.reduce((t, d) => t + d.ventas, 0), total: num(total.toNumber()), utilidad: num(utilidad.toNumber()),
          margen_pct: total.isZero() ? null : num(utilidad.div(total).times(100).toNumber()),
          por_dia: largo <= 31 ? dias.map((d) => ({ dia: d.dia, total: d.total, ventas: d.ventas })) : undefined,
        };
      }
      case "productos_mas_vendidos": {
        const filas = await repo.ventasProducto(e.desde, e.hasta);
        const clave = (e.ordenar_por ?? "ingreso") as "ingreso" | "utilidad" | "cantidad";
        const top = [...filas].sort((a, b) => b[clave] - a[clave]).slice(0, Number(e.limite ?? 5));
        return { ordenado_por: clave, productos: top, hay_mas: filas.length > top.length };
      }
      case "ventas_por_metodo_pago": {
        const f = await repo.ventasMetodo(e.desde, e.hasta);
        return { total: num(sumar(...f.map((x) => x.total)).toNumber()), metodos: f };
      }
      case "ventas_por_vendedor": return { vendedores: await repo.ventasVendedor(e.desde, e.hasta) };
      case "stock_de_producto": {
        const p = await repo.buscarProductos(e.texto);
        return p.length === 0 ? { productos: [], nota: "No hay productos parecidos" } : { productos: p.slice(0, 10), hay_mas: p.length > 10 };
      }
      case "deudas_de_clientes": {
        const d = await repo.deudas(e.cliente ? String(e.cliente) : null);
        return { total_adeudado: num(sumar(...d.map((x) => x.saldo)).toNumber()), clientes: [...d].sort((a, b) => b.saldo - a.saldo).slice(0, 10), hay_mas: d.length > 10 };
      }
      case "plata_dormida": {
        const d = await repo.plataDormida(Number(e.dias ?? 60));
        return { dias: Number(e.dias ?? 60), valor_total: num(sumar(...d.map((x) => x.valor)).toNumber()), productos_parados: d.length, mayores: [...d].sort((a, b) => b.valor - a.valor).slice(0, 10) };
      }
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : "";
    return { error: /permiso/i.test(m) ? "Tu rol no tiene permiso para ver esta información" : "No se pudo consultar" };
  }
}

/** Atajos de fechas que el modelo recibe ya calculados (no tiene que adivinar «el mes pasado»). */
export function calendarioParaModelo(hoy: string): string {
  const mes = hoy.slice(0, 7);
  const ini = `${mes}-01`;
  const finMesPasado = sumarDias(ini, -1);
  return [
    `hoy = ${hoy}`,
    `ayer = ${sumarDias(hoy, -1)}`,
    `últimos 7 días = ${sumarDias(hoy, -6)} a ${hoy}`,
    `este mes = ${ini} a ${hoy}`,
    `mes pasado = ${finMesPasado.slice(0, 7)}-01 a ${finMesPasado}`,
  ].join("; ");
}
