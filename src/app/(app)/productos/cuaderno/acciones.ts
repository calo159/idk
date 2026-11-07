"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requerirContexto } from "@/lib/auth/contexto";
import { paraBd } from "@/lib/dinero";
import { puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zMonto, zUuid } from "@/lib/validaciones/comunes";
import { importarProductos } from "../importar/acciones";

const numericoBd = (v: string) => v as unknown as number;

const esquema = z.object({
  documento_id: zUuid,
  bodega_id: zUuid,
  productos: z
    .array(z.object({ nombre: z.string().trim().min(1).max(120), cantidad: z.number().min(0).max(99_999_999), precio: zMonto, costo: zMonto }))
    .max(300),
  deudas: z
    .array(z.object({ cliente: z.string().trim().min(2).max(120), monto: zMonto.refine((v) => v > 0, "La deuda debe ser mayor a cero"), cliente_id: zUuid.nullable(), telefono: z.string().trim().max(20).nullable() }))
    .max(300),
});

export interface ResumenCuaderno {
  productosCreados: number;
  productosOmitidos: number;
  deudasRegistradas: number;
  clientesNuevos: number;
}

/** Crea lo que la persona aprobó de la lectura del cuaderno: productos con su stock y deudas de clientes. */
export async function importarCuaderno(entrada: unknown): Promise<ResultadoAccion<ResumenCuaderno>> {
  const ctx = await requerirContexto();
  const r = esquema.safeParse(entrada);
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));
  const d = r.data;
  if (d.productos.length > 0 && !puedeEscribir(ctx.rol, "productos")) return fallo("No tienes permiso para crear productos");
  if (d.deudas.length > 0 && ctx.rol !== "dueno" && ctx.rol !== "admin")
    return fallo("Solo el dueño o un administrador registra deudas anteriores");
  const supabase = await crearClienteServidor();
  const resumen: ResumenCuaderno = { productosCreados: 0, productosOmitidos: 0, deudasRegistradas: 0, clientesNuevos: 0 };

  if (d.productos.length > 0) {
    const p = await importarProductos({
      bodega_id: d.bodega_id,
      filas: d.productos.map((x) => ({
        nombre: x.nombre, precio_venta: x.precio, costo: x.costo, cantidad: x.cantidad,
        codigo_barras: null, sku: null, categoria: null, unidad: "unidad", stock_minimo: 0,
      })),
    });
    if (!p.ok) return fallo(p.error);
    resumen.productosCreados = p.datos.creados;
    resumen.productosOmitidos = p.datos.omitidos;
  }

  for (const deuda of d.deudas) {
    let clienteId = deuda.cliente_id;
    if (!clienteId) {
      const { data: nuevo, error } = await supabase
        .from("clientes")
        .insert({ organizacion_id: ctx.organizacionId, nombre: deuda.cliente, telefono: deuda.telefono })
        .select("id")
        .single();
      if (error || !nuevo) return fallo(`No pudimos crear al cliente «${deuda.cliente}» (¿ya existe ese celular?). Lo anterior sí quedó cargado.`);
      clienteId = nuevo.id;
      resumen.clientesNuevos++;
    }
    const { error } = await supabase.rpc("registrar_deuda_inicial", {
      p_cliente: clienteId,
      p_monto: numericoBd(paraBd(deuda.monto)),
      p_motivo: "Deuda anterior del cuaderno",
      p_documento_ia: d.documento_id,
    });
    if (error) return fallo(`No pudimos registrar la deuda de «${deuda.cliente}». Lo anterior sí quedó cargado.`);
    resumen.deudasRegistradas++;
  }

  await supabase.from("documentos_ia").update({ estado: "confirmado" }).eq("id", d.documento_id).eq("organizacion_id", ctx.organizacionId);
  revalidatePath("/productos");
  revalidatePath("/inventario");
  revalidatePath("/clientes");
  return ok(resumen);
}
