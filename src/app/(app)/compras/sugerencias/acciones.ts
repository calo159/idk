"use server";

import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { puede } from "@/lib/permisos";
import { type ResultadoAccion, fallo, ok, zCantidad, zMonto, zUuid } from "@/lib/validaciones/comunes";
import { crearOrden } from "../ordenes/acciones";

const esquema = z.object({
  bodega_id: zUuid,
  grupos: z
    .array(
      z.object({
        proveedor_id: zUuid,
        lineas: z.array(z.object({ producto_id: zUuid, cantidad: zCantidad, costo: zMonto })).min(1).max(300),
      }),
    )
    .min(1, "Elige al menos un producto")
    .max(30),
});

/** Crea UNA orden de compra (borrador) por proveedor con lo elegido. No mueve inventario: es solo la intención de compra. */
export async function crearOrdenesDesdeSugerencia(entrada: unknown): Promise<ResultadoAccion<{ ids: string[] }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "compras.confirmar")) return fallo("No tienes permiso para crear órdenes de compra");
  const r = esquema.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos");
  const ids: string[] = [];
  for (const g of r.data.grupos) {
    const o = await crearOrden({
      proveedor_id: g.proveedor_id,
      bodega_id: r.data.bodega_id,
      fecha_esperada: "",
      nota: "Generada desde la sugerencia de compras",
      lineas: g.lineas.map((l) => ({ producto_id: l.producto_id, presentacion_id: null, cantidad: l.cantidad, costo: l.costo })),
    });
    if (!o.ok) return fallo(ids.length ? `Se crearon ${ids.length} orden(es), pero falló una: ${o.error}` : o.error);
    ids.push(o.datos.id);
  }
  return ok({ ids });
}
