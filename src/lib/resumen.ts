import { z } from "zod";
import { formatoCOP } from "@/lib/dinero";
import { variacionPorcentual } from "@/lib/reportes";

/** Resumen de un periodo tal como lo devuelve `resumen_periodo` (SQL). Se valida: es un jsonb. */
export const esquemaResumen = z.object({
  desde: z.string(),
  hasta: z.string(),
  ventas: z.number(),
  total: z.number(),
  utilidad: z.number(),
  devoluciones: z.number(),
  por_metodo: z.array(z.object({ metodo: z.string(), total: z.number() })),
  top_productos: z.array(z.object({ nombre: z.string(), cantidad: z.number(), ingreso: z.number() })),
  pagos_sin_verificar: z.number(),
  diferencia_caja: z.number(),
  turnos_abiertos: z.number(),
  gastos: z.number(),
  fiado_nuevo: z.number(),
  por_cobrar: z.number(),
  alertas_pendientes: z.number(),
});
export type Resumen = z.infer<typeof esquemaResumen>;

const METODOS: Record<string, string> = { efectivo: "Efectivo", nequi: "Nequi", daviplata: "Daviplata", transferencia: "Transferencia", tarjeta: "Tarjeta", credito: "Fiado", otro: "Otros" };
const flecha = (p: number | null) => (p === null ? "" : ` (${p >= 0 ? "▲" : "▼"} ${Math.abs(p)} %)`);

/** Texto del resumen diario de las 8 p. m. */
export function mensajeResumenDia(r: Resumen, negocio: string, ayer?: Resumen): string {
  if (r.ventas === 0)
    return `📊 *${negocio}* — resumen de hoy\nHoy no hubo ventas registradas.${r.turnos_abiertos ? `\n⚠ Hay ${r.turnos_abiertos} caja(s) abierta(s).` : ""}`;
  const lineas = [
    `📊 *${negocio}* — resumen de hoy`,
    `Vendiste *${formatoCOP(r.total)}* en ${r.ventas} venta(s)${flecha(ayer ? variacionPorcentual(r.total, ayer.total) : null)}`,
    `Utilidad: ${formatoCOP(r.utilidad)}`,
  ];
  if (r.por_metodo.length) lineas.push(`Cobrado: ${r.por_metodo.map((m) => `${METODOS[m.metodo] ?? m.metodo} ${formatoCOP(m.total)}`).join(" · ")}`);
  if (r.top_productos.length) lineas.push(`Lo más vendido: ${r.top_productos.map((p) => p.nombre).join(", ")}`);
  if (r.diferencia_caja !== 0) lineas.push(`${r.diferencia_caja < 0 ? "🔴 Faltante" : "🟠 Sobrante"} en caja: ${formatoCOP(Math.abs(r.diferencia_caja))}`);
  else if (r.turnos_abiertos === 0) lineas.push("✔ La caja cuadró");
  if (r.turnos_abiertos) lineas.push(`⚠ Hay ${r.turnos_abiertos} caja(s) sin cerrar`);
  if (r.pagos_sin_verificar) lineas.push(`⚠ ${r.pagos_sin_verificar} pago(s) electrónicos sin verificar`);
  if (r.gastos) lineas.push(`Gastos del día: ${formatoCOP(r.gastos)}`);
  if (r.alertas_pendientes) lineas.push(`🔔 ${r.alertas_pendientes} alerta(s) por revisar en la app`);
  return lineas.join("\n");
}

/** Texto corto que acompaña al PDF semanal: "ganaste X, mejor producto Y, ojo con Z". */
export function mensajeSemanal(r: Resumen, negocio: string, anterior?: Resumen): string {
  const var_ = anterior ? variacionPorcentual(r.total, anterior.total) : null;
  const partes = [`📈 *${negocio}* — tu semana`, `Vendiste ${formatoCOP(r.total)}${flecha(var_)} y tu utilidad fue ${formatoCOP(r.utilidad)}.`];
  if (r.top_productos[0]) partes.push(`Tu mejor producto: ${r.top_productos[0].nombre}.`);
  const ojo: string[] = [];
  if (r.diferencia_caja < 0) ojo.push(`faltantes de caja por ${formatoCOP(-r.diferencia_caja)}`);
  if (r.pagos_sin_verificar) ojo.push(`${r.pagos_sin_verificar} pagos electrónicos sin verificar`);
  if (r.por_cobrar > 0) ojo.push(`${formatoCOP(r.por_cobrar)} por cobrar a clientes`);
  if (ojo.length) partes.push(`Ojo con: ${ojo.join(", ")}.`);
  partes.push("Te dejo el reporte completo en PDF 👇");
  return partes.join("\n");
}
