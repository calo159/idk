import { type Valor, dinero } from "@/lib/dinero";
import { hoyBogota, rangoMes, sumarDias } from "@/lib/fechas";

export type Periodo = "hoy" | "ayer" | "7d" | "30d" | "mes" | "mes_anterior";

export const PERIODOS: { valor: Periodo; etiqueta: string }[] = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "ayer", etiqueta: "Ayer" },
  { valor: "7d", etiqueta: "7 días" },
  { valor: "30d", etiqueta: "30 días" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "mes_anterior", etiqueta: "Mes anterior" },
];

export const esPeriodo = (v: string | undefined): v is Periodo => PERIODOS.some((p) => p.valor === v);

/** Rango de días (hora de Bogotá, ambos extremos incluidos) de un periodo. */
export function rangoPeriodo(periodo: Periodo, hoy: string = hoyBogota()): { desde: string; hasta: string } {
  switch (periodo) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "ayer": {
      const a = sumarDias(hoy, -1);
      return { desde: a, hasta: a };
    }
    case "7d":
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case "30d":
      return { desde: sumarDias(hoy, -29), hasta: hoy };
    case "mes":
      return { desde: rangoMes(hoy).desde, hasta: hoy };
    case "mes_anterior": {
      const ultimo = sumarDias(rangoMes(hoy).desde, -1);
      return rangoMes(ultimo);
    }
  }
}

/** Variación porcentual (entero) frente al periodo anterior; null si no hay base para comparar. */
export function variacionPorcentual(actual: Valor, anterior: Valor): number | null {
  const base = dinero(anterior);
  if (base.lte(0)) return null;
  return dinero(actual).minus(base).div(base).times(100).toDecimalPlaces(0).toNumber();
}

/** Escapa una celda de CSV y neutraliza fórmulas (=, +, -, @) para que Excel no las ejecute. */
export function celdaCSV(valor: unknown): string {
  let t = valor === null || valor === undefined ? "" : String(valor);
  if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+([.,]\d+)?$/.test(t)) t = `'${t}`;
  return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** CSV con BOM y `;` como separador (Excel en español lo abre bien). */
export function aCSV(columnas: string[], filas: unknown[][]): string {
  const lineas = [columnas, ...filas].map((f) => f.map(celdaCSV).join(";"));
  return `﻿${lineas.join("\r\n")}\r\n`;
}
