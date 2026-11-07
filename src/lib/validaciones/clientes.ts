import { z } from "zod";
import { restar, dinero, type Valor } from "@/lib/dinero";
import { zCelularOpcional, zDia, zDocumentoCO, zMetodoPago, zTexto, zUuid } from "./comunes";
import { montoTexto } from "./productos";

export const esquemaCliente = z.object({
  nombre: zTexto(2, 120, "El nombre"),
  documento: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(zDocumentoCO.optional()),
  telefono: zCelularOpcional,
  fecha_nacimiento: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(zDia.optional()),
  cupo_credito: montoTexto(0),
  acepta_mensajes: z.boolean(),
});

export const esquemaAbono = z.object({
  cliente_id: zUuid,
  monto: montoTexto().refine((v) => v > 0, "El abono debe ser mayor a cero"),
  metodo: zMetodoPago.refine((m) => m !== "credito", "Un abono no puede ser a crédito"),
  turno_id: zUuid.nullish().transform((v) => v ?? null),
});

/** Cupo que le queda al cliente (nunca negativo). */
export function cupoDisponible(cupo: Valor, saldo: Valor) {
  const d = restar(cupo, saldo);
  return d.isNegative() ? dinero(0) : d;
}

/** ¿Puede llevar fiado `monto` más? Cupo 0 = sin crédito. */
export function puedeFiar(cupo: Valor, saldo: Valor, monto: Valor): boolean {
  const c = dinero(cupo);
  if (c.lte(0)) return false;
  return dinero(saldo).plus(dinero(monto)).lte(c);
}

export type EstadoCartera = "sin_deuda" | "al_dia" | "cerca_del_cupo" | "excedido";

export function estadoCartera(cupo: Valor, saldo: Valor): EstadoCartera {
  const s = dinero(saldo);
  if (s.lte(0)) return "sin_deuda";
  const c = dinero(cupo);
  if (s.gt(c)) return "excedido";
  if (c.gt(0) && s.gte(c.times(0.8))) return "cerca_del_cupo";
  return "al_dia";
}
