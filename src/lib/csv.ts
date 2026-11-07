/** Lector de CSV mínimo y seguro: comillas, saltos de línea dentro de celdas, separador `,` o `;`. */

export function detectarSeparador(texto: string): "," | ";" | "\t" {
  const primera = texto.split(/\r?\n/, 1)[0] ?? "";
  const cuenta = (c: string) => primera.split(c).length - 1;
  const [coma, punto, tab] = [cuenta(","), cuenta(";"), cuenta("\t")];
  if (tab > coma && tab > punto) return "\t";
  return punto > coma ? ";" : ",";
}

export function leerCSV(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "");
  const sep = detectarSeparador(limpio);
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entreComillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]!;
    if (entreComillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"') entreComillas = true;
    else if (c === sep) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda);
      celda = "";
      filas.push(fila);
      fila = [];
    } else celda += c;
  }
  if (celda !== "" || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}
