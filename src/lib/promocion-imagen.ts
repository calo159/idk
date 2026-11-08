import { formatoCOP } from "@/lib/dinero";
import { formatoFecha } from "@/lib/fechas";

/** Datos de una promoción para armar su afiche y su mensaje de WhatsApp. */
export interface DatosPromocion {
  negocio: string;
  nombre: string;
  hasta: string; // AAAA-MM-DD
  items: { nombre: string; precioNormal: number; precioPromo: number }[];
}

export const porcentajeAhorro = (normal: number, promo: number) => (normal > 0 ? Math.round(((normal - promo) / normal) * 100) : 0);

export function textoPromocionWhatsApp(d: DatosPromocion): string {
  const lineas = d.items.slice(0, 12).map((i) => `• ${i.nombre}: ~${formatoCOP(i.precioNormal)}~ *${formatoCOP(i.precioPromo)}* (-${porcentajeAhorro(i.precioNormal, i.precioPromo)} %)`);
  const mas = d.items.length > 12 ? [`…y ${d.items.length - 12} más`] : [];
  return [`🔥 *${d.nombre}* — ${d.negocio}`, ...lineas, ...mas, `Hasta el ${formatoFecha(d.hasta)} o hasta agotar existencias.`].join("\n");
}

/** Parte un texto en renglones que quepan en `ancho` según la función `medir` (por ejemplo ctx.measureText). */
export function partirEnRenglones(texto: string, ancho: number, medir: (t: string) => number, maxRenglones = 2): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const renglones: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (medir(prueba) <= ancho || !actual) actual = prueba;
    else {
      renglones.push(actual);
      actual = p;
    }
  }
  if (actual) renglones.push(actual);
  if (renglones.length > maxRenglones) {
    const cortado = renglones.slice(0, maxRenglones);
    // Se agrega «…» al último renglón; si no cabe, se le quitan palabras (siempre queda al menos una).
    let ultimo = cortado[maxRenglones - 1]!;
    while (medir(`${ultimo}…`) > ancho && ultimo.includes(" ")) ultimo = ultimo.replace(/\s+\S+$/, "");
    cortado[maxRenglones - 1] = `${ultimo}…`;
    return cortado;
  }
  return renglones;
}

/** Lo mínimo del contexto 2D que se usa: permite probar el dibujo sin un navegador. */
export interface Lienzo {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(t: string, x: number, y: number, maxWidth?: number): void;
  measureText(t: string): { width: number };
}

export const TAMANO_AFICHE = 1080;

/** Dibuja un afiche cuadrado (1080×1080) listo para WhatsApp. Máximo 5 productos destacados. */
export function dibujarAfiche(c: Lienzo, d: DatosPromocion): void {
  const N = TAMANO_AFICHE;
  c.fillStyle = "#0f766e";
  c.fillRect(0, 0, N, N);
  c.fillStyle = "#ffffff";
  c.fillRect(48, 250, N - 96, N - 330);

  c.textAlign = "center";
  c.fillStyle = "#ffffff";
  c.font = "700 64px sans-serif";
  const titulo = partirEnRenglones(d.nombre.toUpperCase(), N - 120, (t) => c.measureText(t).width, 2);
  titulo.forEach((r, i) => c.fillText(r, N / 2, 110 + i * 70));
  c.font = "400 34px sans-serif";
  c.fillText(d.negocio, N / 2, 215);

  const destacados = [...d.items].sort((a, b) => porcentajeAhorro(b.precioNormal, b.precioPromo) - porcentajeAhorro(a.precioNormal, a.precioPromo)).slice(0, 5);
  const alto = Math.min(130, Math.floor((N - 330 - 40) / Math.max(destacados.length, 1)));
  destacados.forEach((it, i) => {
    const y = 300 + i * alto;
    c.textAlign = "left";
    c.fillStyle = "#111111";
    c.font = "600 38px sans-serif";
    const nombre = partirEnRenglones(it.nombre, 560, (t) => c.measureText(t).width, 1)[0] ?? "";
    c.fillText(nombre, 84, y + 40);
    c.font = "400 28px sans-serif";
    c.fillStyle = "#6b7280";
    c.fillText(`Antes ${formatoCOP(it.precioNormal)}`, 84, y + 80);
    c.textAlign = "right";
    c.fillStyle = "#0f766e";
    c.font = "800 52px sans-serif";
    c.fillText(formatoCOP(it.precioPromo), N - 84, y + 55);
    c.fillStyle = "#dc2626";
    c.font = "700 30px sans-serif";
    c.fillText(`-${porcentajeAhorro(it.precioNormal, it.precioPromo)} %`, N - 84, y + 95);
  });

  c.textAlign = "center";
  c.fillStyle = "#ffffff";
  c.font = "600 34px sans-serif";
  c.fillText(`Hasta el ${formatoFecha(d.hasta)} o hasta agotar existencias`, N / 2, N - 28);
}
