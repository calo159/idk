/**
 * Hash perceptual dHash (64 bits) para detectar capturas repetidas aunque se recomprimen o reescalan.
 * La parte pura (a partir de píxeles en gris) se prueba; el dibujo en canvas vive en `hashPerceptualDeArchivo`.
 */

/** Recibe una imagen en gris de 9 columnas × 8 filas (72 valores 0–255) y devuelve 16 caracteres hex. */
export function dHashDesdeGris(gris: ArrayLike<number>): string {
  if (gris.length !== 72) throw new Error("Se esperan 9x8 píxeles");
  let bits = "";
  for (let f = 0; f < 8; f++)
    for (let c = 0; c < 8; c++) bits += gris[f * 9 + c]! > gris[f * 9 + c + 1]! ? "1" : "0";
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

export function distanciaHamming(a: string, b: string): number {
  if (a.length !== b.length) throw new Error("Hashes de distinto largo");
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

export const esHashPerceptual = (v: string) => /^[0-9a-f]{16}$/.test(v);

/** Solo navegador: reduce la imagen a 9×8 en gris y calcula el dHash. */
export async function hashPerceptualDeArchivo(archivo: File): Promise<string | null> {
  try {
    const bmp = await createImageBitmap(archivo);
    const canvas = document.createElement("canvas");
    canvas.width = 9;
    canvas.height = 8;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, 9, 8);
    const { data } = ctx.getImageData(0, 0, 9, 8);
    const gris = new Array<number>(72);
    for (let i = 0; i < 72; i++)
      gris[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
    return dHashDesdeGris(gris);
  } catch {
    return null;
  }
}
