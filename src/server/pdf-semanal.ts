import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatoCOP } from "@/lib/dinero";
import { formatoFecha } from "@/lib/fechas";
import type { Resumen } from "@/lib/resumen";

/** PDF de una página con el reporte semanal. Solo texto y tablas simples: se ve bien en el celular. */
export async function pdfSemanal(negocio: string, r: Resumen, anterior?: Resumen): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Reporte semanal — ${negocio}`);
  doc.setAuthor("Surtix");
  const pagina = doc.addPage([595, 842]); // A4
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const verde = rgb(0.06, 0.46, 0.43);
  const gris = rgb(0.4, 0.4, 0.4);
  const margen = 48;
  let y = 790;

  const texto = (t: string, o: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    pagina.drawText(t, { x: o.x ?? margen, y, size: o.size ?? 11, font: o.bold ? negrita : normal, color: o.color ?? rgb(0.1, 0.1, 0.1) });
  };
  const derecha = (t: string, o: { size?: number; bold?: boolean } = {}) => {
    const size = o.size ?? 11;
    const w = (o.bold ? negrita : normal).widthOfTextAtSize(t, size);
    pagina.drawText(t, { x: 595 - margen - w, y, size, font: o.bold ? negrita : normal });
  };
  const fila = (izq: string, der: string, bold = false) => {
    texto(izq, { bold });
    derecha(der, { bold });
    y -= 18;
  };
  const titulo = (t: string) => {
    y -= 10;
    texto(t, { size: 13, bold: true, color: verde });
    y -= 6;
    pagina.drawLine({ start: { x: margen, y }, end: { x: 595 - margen, y }, thickness: 0.7, color: verde });
    y -= 18;
  };
  // Los caracteres fuera de WinAnsi (emojis) romperían la fuente estándar: se limpian.
  const limpio = (t: string) => t.replace(/[^\x20-\x7E -ÿ]/g, "").slice(0, 70);

  texto(limpio(negocio), { size: 20, bold: true });
  y -= 22;
  texto(`Reporte semanal: ${formatoFecha(r.desde)} al ${formatoFecha(r.hasta)}`, { color: gris });
  y -= 14;

  titulo("Resumen");
  fila("Ventas", formatoCOP(r.total), true);
  if (anterior && anterior.total > 0) {
    const p = Math.round(((r.total - anterior.total) / anterior.total) * 100);
    fila("Frente a la semana anterior", `${p >= 0 ? "+" : ""}${p} %`);
  }
  fila("Numero de ventas", String(r.ventas));
  fila("Utilidad", formatoCOP(r.utilidad), true);
  if (r.devoluciones) fila("Devoluciones de clientes", formatoCOP(r.devoluciones));
  fila("Gastos registrados", formatoCOP(r.gastos));

  titulo("Como te pagaron");
  for (const m of r.por_metodo) fila(limpio(m.metodo.charAt(0).toUpperCase() + m.metodo.slice(1)), formatoCOP(m.total));
  if (r.por_metodo.length === 0) fila("Sin ventas esta semana", "");

  titulo("Lo mas vendido");
  for (const p of r.top_productos) fila(limpio(p.nombre), formatoCOP(p.ingreso));

  titulo("Para revisar");
  fila("Diferencia de caja en la semana", formatoCOP(r.diferencia_caja));
  fila("Pagos electronicos sin verificar", String(r.pagos_sin_verificar));
  fila("Por cobrar a clientes (hoy)", formatoCOP(r.por_cobrar));
  fila("Alertas pendientes en la app", String(r.alertas_pendientes));

  pagina.drawText("Generado por Surtix", { x: margen, y: 40, size: 9, font: normal, color: gris });
  return doc.save();
}
