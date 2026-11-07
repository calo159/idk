/** Utilidades de códigos de barras (puras, probadas). */

/** Dígito verificador GS1 (EAN-13, EAN-8, UPC-A) para el cuerpo sin el último dígito. */
export function digitoVerificadorGS1(cuerpo: string): number {
  let suma = 0;
  const d = cuerpo.split("").reverse();
  for (let i = 0; i < d.length; i++) suma += Number(d[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (suma % 10)) % 10;
}

/** true si es EAN-13/EAN-8/UPC-A con dígito verificador correcto. */
export function esGS1Valido(codigo: string): boolean {
  if (!/^\d+$/.test(codigo) || ![8, 12, 13].includes(codigo.length)) return false;
  return digitoVerificadorGS1(codigo.slice(0, -1)) === Number(codigo.at(-1));
}

/**
 * Limpia lo que entrega un lector (espacios, saltos de línea). Un UPC-A (12) leído como EAN-13
 * viene con un 0 inicial: se devuelve tal cual lo leyó el lector para no duplicar el producto.
 */
export function normalizarCodigo(crudo: string): string {
  return crudo.replace(/[\s\u0000-\u001f]/g, "");
}

/** Variantes con las que puede estar guardado un mismo código (UPC-A ↔ EAN-13 con cero inicial). */
export function variantesCodigo(codigo: string): string[] {
  const c = normalizarCodigo(codigo);
  const v = new Set([c]);
  if (/^\d{12}$/.test(c)) v.add(`0${c}`);
  if (/^0\d{12}$/.test(c)) v.add(c.slice(1));
  return [...v];
}
