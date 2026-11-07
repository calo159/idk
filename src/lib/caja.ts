import { type Monto, type Valor, dinero, multiplicar, restar, sumar } from "@/lib/dinero";
import { z } from "zod";
import { zUuid } from "@/lib/validaciones/comunes";
import { montoTexto } from "@/lib/validaciones/productos";

/** Denominaciones del peso colombiano (billetes y monedas vigentes). */
export const DENOMINACIONES = [
  100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50,
] as const;
export type Denominacion = (typeof DENOMINACIONES)[number];

/** Conteo: denominación → cantidad de piezas. */
export type Conteo = Partial<Record<string, number>>;

export function totalConteo(conteo: Conteo): Monto {
  return sumar(
    ...Object.entries(conteo).map(([den, n]) => multiplicar(den, n ?? 0)),
  );
}

export const esquemaApertura = z.object({ base_inicial: montoTexto(0) });

export const esquemaCierre = z.object({
  turno_id: zUuid,
  conteo: z
    .record(
      z.string().refine((k) => (DENOMINACIONES as readonly number[]).includes(Number(k)), "Denominación inválida"),
      z.number().int("Solo piezas enteras").min(0, "No puede ser negativo").max(100_000),
    ),
});

export type EstadoCierre = "cuadra" | "sobrante" | "faltante";

export function estadoCierre(diferencia: Valor): EstadoCierre {
  const d = dinero(diferencia);
  if (d.isZero()) return "cuadra";
  return d.isPositive() ? "sobrante" : "faltante";
}

/** Efectivo que debería haber en la caja (espejo de `cerrar_turno`). */
export function efectivoEsperado(base: Valor, ventasEfectivo: Valor, abonosEfectivo: Valor): Monto {
  return sumar(base, ventasEfectivo, abonosEfectivo);
}

export function diferenciaCaja(contado: Valor, esperado: Valor): Monto {
  return restar(contado, esperado);
}
