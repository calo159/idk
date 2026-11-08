import { type Valor, dinero } from "@/lib/dinero";

/**
 * Simulador de precios: «¿qué pasa con mi utilidad si cambio estos precios?». Usa las unidades vendidas en los
 * últimos 30 días y una elasticidad opcional (cuánto baja la venta cuando sube el precio).
 *   elasticidad = −0,8 → si el precio sube 10 %, se vende 8 % menos.
 * Es una estimación para decidir, no una promesa.
 */
export interface ItemSimulacion {
  costo: Valor;
  precioActual: Valor;
  precioNuevo: Valor;
  unidades30d: Valor;
}

export interface ResultadoSimulacion {
  ingresoActual: number;
  ingresoNuevo: number;
  utilidadActual: number;
  utilidadNueva: number;
  diferenciaUtilidad: number;
  margenActual: number;
  margenNuevo: number;
}

export function simularPrecios(items: ItemSimulacion[], elasticidad = 0): ResultadoSimulacion {
  let ingA = dinero(0), ingN = dinero(0), utA = dinero(0), utN = dinero(0);
  for (const it of items) {
    const costo = dinero(it.costo), pA = dinero(it.precioActual), pN = dinero(it.precioNuevo), u = dinero(it.unidades30d);
    const cambio = pA.isZero() ? 0 : pN.minus(pA).div(pA).times(100).toNumber();
    // La venta nunca baja de 0 ni sube por encima del doble por un precio más bajo.
    const factor = Math.min(2, Math.max(0, 1 + elasticidad * (cambio / 100)));
    const uN = u.times(factor);
    ingA = ingA.plus(pA.times(u));
    ingN = ingN.plus(pN.times(uN));
    utA = utA.plus(pA.minus(costo).times(u));
    utN = utN.plus(pN.minus(costo).times(uN));
  }
  const pct = (ut: typeof utA, ing: typeof ingA) => (ing.isZero() ? 0 : Math.round(ut.div(ing).times(1000).toNumber()) / 10);
  return {
    ingresoActual: ingA.toNumber(),
    ingresoNuevo: ingN.toNumber(),
    utilidadActual: utA.toNumber(),
    utilidadNueva: utN.toNumber(),
    diferenciaUtilidad: utN.minus(utA).toNumber(),
    margenActual: pct(utA, ingA),
    margenNuevo: pct(utN, ingN),
  };
}

/** Precio con un ajuste porcentual, redondeado como el sistema (hacia arriba a $ 100, o $ 50 si es menor a $ 1.000). */
export function ajustarPrecio(precio: number, pct: number): number {
  const n = precio * (1 + pct / 100);
  if (!(n > 0)) return precio;
  return n < 1000 ? Math.ceil(n / 50) * 50 : Math.ceil(n / 100) * 100;
}
