"use server";

import { revalidatePath } from "next/cache";
import { requerirContexto } from "@/lib/auth/contexto";
import { cantidadParaBd, paraBd } from "@/lib/dinero";
import { puede, puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { combinarVariantes, esquemaLista, esquemaLote, esquemaPrecioLista, esquemaSeriales, listaDesdeTexto, parsearSeriales } from "@/lib/validaciones/avanzado";
import { type ResultadoAccion, erroresPorCampo, fallo, ok, zUuid } from "@/lib/validaciones/comunes";

const numericoBd = (v: string) => v as unknown as number;
const campo = (f: FormData, n: string) => String(f.get(n) ?? "");
const admin = (rol: string) => rol === "dueno" || rol === "admin";

// ---- Listas de precios --------------------------------------------------------------------
export async function crearLista(_p: ResultadoAccion | null, f: FormData): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!admin(ctx.rol)) return fallo("Solo el dueño o un administrador crea listas de precios");
  const r = esquemaLista.safeParse({ nombre: campo(f, "nombre"), descripcion: campo(f, "descripcion") });
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("crear_lista_precios", { p_org: ctx.organizacionId, p_nombre: r.data.nombre, p_descripcion: r.data.descripcion });
  if (error) return fallo(/unique|duplicate/i.test(error.message) ? "Ya tienes una lista con ese nombre" : "No pudimos crear la lista");
  revalidatePath("/configuracion/listas");
  return ok(undefined);
}

export async function fijarPrecioLista(entrada: unknown): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!admin(ctx.rol)) return fallo("Solo el dueño o un administrador cambia precios");
  const r = esquemaPrecioLista.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("fijar_precio_lista", { p_lista: r.data.lista_id, p_producto: r.data.producto_id, p_precio: numericoBd(paraBd(r.data.precio)) });
  if (error) return fallo("No pudimos guardar el precio");
  revalidatePath("/configuracion/listas");
  return ok(undefined);
}

export async function asignarLista(clienteId: string, listaId: string): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!admin(ctx.rol)) return fallo("Solo el dueño o un administrador asigna listas");
  const c = zUuid.safeParse(clienteId);
  const l = listaId ? zUuid.safeParse(listaId) : null;
  if (!c.success || (l && !l.success)) return fallo("Datos inválidos");
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("asignar_lista_cliente", { p_cliente: c.data, p_lista: (l?.success ? l.data : null) as unknown as string });
  if (error) return fallo("No pudimos asignar la lista");
  revalidatePath(`/clientes/${c.data}`);
  return ok(undefined);
}

// ---- Variantes ----------------------------------------------------------------------------
export async function crearVariantes(productoId: string, tallas: string, colores: string, otro: string, nombreOtro: string): Promise<ResultadoAccion<{ creadas: number }>> {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "productos")) return fallo("No tienes permiso para crear variantes");
  const id = zUuid.safeParse(productoId);
  if (!id.success) return fallo("Producto inválido");
  const opciones: Record<string, string[]> = { talla: listaDesdeTexto(tallas), color: listaDesdeTexto(colores) };
  if (nombreOtro.trim() && otro.trim()) opciones[nombreOtro.trim().toLowerCase().slice(0, 20)] = listaDesdeTexto(otro);
  const combos = combinarVariantes(opciones);
  if (combos.length === 0) return fallo("Escribe al menos una talla, color u otra opción");
  if (combos.length > 100) return fallo("Son demasiadas combinaciones (máximo 100). Reduce las opciones.");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("crear_variantes", { p_base: id.data, p_combinaciones: combos });
  if (error) return fallo("No pudimos crear las variantes");
  revalidatePath(`/productos/${id.data}`);
  revalidatePath("/productos");
  return ok({ creadas: Number(data) });
}

// ---- Lotes --------------------------------------------------------------------------------
export async function registrarLote(entrada: unknown): Promise<ResultadoAccion> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "inventario.ajustar")) return fallo("No tienes permiso para registrar lotes");
  const r = esquemaLote.safeParse(entrada);
  if (!r.success) return fallo(r.error.issues[0]?.message ?? "Revisa los datos", erroresPorCampo(r.error));
  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("registrar_lote", {
    p_org: ctx.organizacionId, p_producto: r.data.producto_id, p_bodega: r.data.bodega_id, p_codigo: r.data.codigo,
    p_vence: r.data.vence as unknown as string, p_cantidad: numericoBd(cantidadParaBd(r.data.cantidad)),
  });
  if (error) return fallo("No pudimos registrar el lote");
  revalidatePath("/inventario/vencimientos");
  return ok(undefined);
}

// ---- Seriales -----------------------------------------------------------------------------
export async function registrarSeriales(_p: ResultadoAccion<{ n: number }> | null, f: FormData): Promise<ResultadoAccion<{ n: number }>> {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "inventario.ajustar")) return fallo("No tienes permiso para registrar seriales");
  const r = esquemaSeriales.safeParse({ producto_id: campo(f, "producto_id"), bodega_id: campo(f, "bodega_id"), texto: campo(f, "texto") });
  if (!r.success) return fallo("Revisa los datos", erroresPorCampo(r.error));
  const { seriales, repetidos, invalidos } = parsearSeriales(r.data.texto);
  if (invalidos.length) return fallo(`Seriales inválidos: ${invalidos.slice(0, 5).join(", ")}. Usa letras, números y guiones (mínimo 3 caracteres).`, { texto: "invalido" });
  if (repetidos.length) return fallo(`Hay seriales repetidos en tu lista: ${repetidos.slice(0, 5).join(", ")}.`, { texto: "repetido" });
  if (seriales.length === 0) return fallo("Escribe al menos un serial", { texto: "vacio" });
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.rpc("registrar_seriales", { p_org: ctx.organizacionId, p_producto: r.data.producto_id, p_bodega: r.data.bodega_id, p_seriales: seriales });
  if (error) return fallo(/repetido/.test(error.message) ? "Alguno de esos seriales ya está registrado en tu negocio. No se cargó ninguno." : "No pudimos registrar los seriales");
  revalidatePath("/inventario/seriales");
  return ok({ n: Number(data) });
}
