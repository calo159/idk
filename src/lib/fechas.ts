/**
 * Fechas en la zona de Colombia (America/Bogota, UTC-5 todo el año, sin horario de verano).
 *
 * Convención: en la base de datos todo es `timestamptz` (instante absoluto). Un "día de negocio" es
 * el día calendario de Bogotá, representado como texto `YYYY-MM-DD`.
 */
export const ZONA = "America/Bogota";
const OFFSET_HORAS = 5; // Bogotá = UTC-5

const partesFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface PartesFecha {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
}

/** Descompone un instante en año/mes/día/hora de Bogotá. */
export function partesBogota(fecha: Date | string | number): PartesFecha {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) throw new RangeError("Fecha inválida");
  const m = Object.fromEntries(partesFmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    anio: Number(m.year),
    mes: Number(m.month),
    dia: Number(m.day),
    hora: Number(m.hour),
    minuto: Number(m.minute),
    segundo: Number(m.second),
  };
}

const dos = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` del día de Bogotá en que ocurre ese instante. */
export function diaBogota(fecha: Date | string | number = new Date()): string {
  const p = partesBogota(fecha);
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}`;
}

export const hoyBogota = (): string => diaBogota(new Date());

const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function esDiaValido(dia: string): boolean {
  const m = RE_DIA.exec(dia);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** Instante en que empieza ese día en Bogotá (00:00 Bogotá = 05:00 UTC). */
export function inicioDiaBogota(dia: string): Date {
  if (!esDiaValido(dia)) throw new RangeError(`Día inválido: ${dia}`);
  const [y, mo, d] = dia.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, mo - 1, d, OFFSET_HORAS, 0, 0, 0));
}

/** Primer instante del día siguiente (límite superior exclusivo). */
export function finDiaBogota(dia: string): Date {
  return inicioDiaBogota(sumarDias(dia, 1));
}

export function sumarDias(dia: string, n: number): string {
  if (!esDiaValido(dia)) throw new RangeError(`Día inválido: ${dia}`);
  const [y, mo, d] = dia.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return `${t.getUTCFullYear()}-${dos(t.getUTCMonth() + 1)}-${dos(t.getUTCDate())}`;
}

/** [desde, hasta) en instantes UTC para filtrar `creado_en` de un rango de días de Bogotá (ambos incluidos). */
export function rangoDias(desde: string, hasta: string): { desde: Date; hasta: Date } {
  return { desde: inicioDiaBogota(desde), hasta: finDiaBogota(hasta) };
}

export function rangoMes(dia: string = hoyBogota()): { desde: string; hasta: string } {
  const [y, mo] = dia.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { desde: `${y}-${dos(mo)}-01`, hasta: `${y}-${dos(mo)}-${dos(ultimo)}` };
}

/** Diferencia en días calendario (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((inicioDiaBogota(b).getTime() - inicioDiaBogota(a).getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Presentación (español de Colombia)
// ---------------------------------------------------------------------------

const MESES_CORTOS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function aFecha(v: Date | string | number): Date {
  return v instanceof Date ? v : new Date(v.toString().length === 10 ? `${v}T12:00:00-05:00` : v);
}

/** `7 nov 2026` */
export function formatoFecha(v: Date | string | number): string {
  const p = partesBogota(aFecha(v));
  return `${p.dia} ${MESES_CORTOS[p.mes - 1]} ${p.anio}`;
}

/** `2:35 p. m.` */
export function formatoHora(v: Date | string | number): string {
  const p = partesBogota(aFecha(v));
  const h12 = p.hora % 12 === 0 ? 12 : p.hora % 12;
  return `${h12}:${dos(p.minuto)} ${p.hora < 12 ? "a. m." : "p. m."}`;
}

/** `7 nov 2026, 2:35 p. m.` */
export function formatoFechaHora(v: Date | string | number): string {
  return `${formatoFecha(v)}, ${formatoHora(v)}`;
}

/** `sábado 7 de noviembre` */
export function formatoDiaLargo(v: Date | string | number): string {
  const d = aFecha(v);
  const p = partesBogota(d);
  const dow = new Date(Date.UTC(p.anio, p.mes - 1, p.dia)).getUTCDay();
  const mes = new Intl.DateTimeFormat("es-CO", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(p.anio, p.mes - 1, 1)),
  );
  return `${DIAS_SEMANA[dow]} ${p.dia} de ${mes}`;
}

/** `hace 5 minutos`, `hace 2 horas`, `ayer`, `hace 12 días` */
export function haceCuanto(v: Date | string | number, ahora: Date = new Date()): string {
  const seg = Math.max(0, Math.round((ahora.getTime() - aFecha(v).getTime()) / 1000));
  if (seg < 45) return "hace un momento";
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} ${min === 1 ? "minuto" : "minutos"}`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = diasEntre(diaBogota(v), diaBogota(ahora));
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
}
