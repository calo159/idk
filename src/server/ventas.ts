import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contexto } from "@/lib/auth/contexto";
import { cantidadParaBd, dinero, formatoCOP, paraBd } from "@/lib/dinero";
import { puede } from "@/lib/permisos";
import type { Database, Json } from "@/lib/supabase/tipos";
import { puedeFiar } from "@/lib/validaciones/clientes";
import { type ResultadoAccion, erroresPorCampo, fallo, ok } from "@/lib/validaciones/comunes";
import { esquemaVenta } from "@/lib/validaciones/ventas";
import { resumirPagos, totalVenta } from "@/lib/ventas";

type Supabase = SupabaseClient<Database>;
const numericoBd = (v: string) => v as unknown as number;

export interface VentaRegistrada {
  ventaId: string;
  numero: number;
  /** true si esta venta ya se había registrado (reintento o sincronización repetida). */
  duplicada: boolean;
  vuelto: string;
  /** Estado de verificación de los pagos con comprobante (Nequi, Daviplata, transferencia). */
  verificaciones: { metodo: string; estado: string }[];
}

const METODOS_CON_COMPROBANTE = ["nequi", "daviplata", "transferencia"];

/**
 * Registra y confirma una venta del POS de forma transaccional e idempotente.
 * Lo usan la Server Action del POS y la sincronización offline.
 * El stock, el costo, la cartera y el consecutivo los resuelve `confirmar_venta` en SQL.
 */
export async function registrarVenta(
  supabase: Supabase,
  ctx: Contexto,
  entrada: unknown,
): Promise<ResultadoAccion<VentaRegistrada>> {
  if (!puede(ctx.rol, "ventas.confirmar")) return fallo("No tienes permiso para vender");
  const r = esquemaVenta.safeParse(entrada);
  if (!r.success) return fallo("Revisa los datos de la venta", erroresPorCampo(r.error));
  const d = r.data;

  // Idempotencia: si ya existe una venta con este offline_id, no se vuelve a crear.
  const existente = await buscarPorOffline(supabase, ctx.organizacionId, d.offline_id);
  if (existente) return ok({ ...existente, duplicada: true, vuelto: "0.00", verificaciones: [] });

  // La venta debe pertenecer a un turno de caja abierto del vendedor.
  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id")
    .eq("organizacion_id", ctx.organizacionId)
    .eq("usuario_id", ctx.usuarioId)
    .eq("estado", "abierto")
    .maybeSingle();
  if (!turno) return fallo("Abre tu caja antes de vender");

  // Totales y pagos: se recalculan aquí, no se confía en el navegador.
  const total = totalVenta(d.lineas, d.descuento);
  if (total.lte(0)) return fallo("El total de la venta debe ser mayor a cero");
  const pagos = resumirPagos(total, d.pagos);
  if (!pagos.faltante.isZero())
    return fallo(
      pagos.faltante.gt(0)
        ? `Faltan ${formatoCOP(pagos.faltante)} para completar el pago`
        : "El pago supera el total (el vuelto solo se da en efectivo)",
    );

  // Fiado: exige cliente y respeta el cupo.
  const aCredito = pagos.pagosParaBd
    .filter((p) => p.metodo === "credito")
    .reduce((s, p) => s.plus(p.monto), dinero(0));
  if (aCredito.gt(0)) {
    if (!d.cliente_id) return fallo("Para fiar elige un cliente");
    const { data: cli } = await supabase
      .from("clientes")
      .select("cupo_credito, saldo")
      .eq("id", d.cliente_id)
      .eq("organizacion_id", ctx.organizacionId)
      .maybeSingle();
    if (!cli) return fallo("Cliente no encontrado");
    const dentro = puedeFiar(cli.cupo_credito, cli.saldo, aCredito);
    const puedeAutorizar = ctx.rol === "dueno" || ctx.rol === "admin";
    // Un cliente con mal historial de pago solo recibe fiado con autorización del dueño o un administrador.
    const { data: pun } = await supabase.rpc("puntaje_cliente", { p_cliente: d.cliente_id });
    if (pun?.[0]?.categoria === "malo" && !(d.autorizar_exceso_cupo && puedeAutorizar))
      return fallo(
        puedeAutorizar
          ? "Este cliente tiene mal historial de pago (deuda vencida). Puedes autorizar el fiado bajo tu responsabilidad."
          : "Este cliente tiene mal historial de pago. Pide autorización al dueño o administrador para fiarle.",
        { cupo: "excedido" },
      );
    if (!dentro && !(d.autorizar_exceso_cupo && puedeAutorizar))
      return fallo(
        puedeAutorizar
          ? "La venta supera el cupo del cliente. Puedes autorizarla."
          : "La venta supera el cupo del cliente. Pide autorización al dueño o administrador.",
        { cupo: "excedido" },
      );
  }

  // Precios del catálogo para auditar cualquier cambio de precio.
  const ids = [...new Set(d.lineas.map((l) => l.producto_id))];
  const [{ data: productos }, { data: presentaciones }] = await Promise.all([
    supabase.from("productos").select("id, precio_venta, activo").in("id", ids),
    supabase.from("presentaciones").select("id, precio_venta").in("producto_id", ids),
  ]);
  if ((productos ?? []).length !== ids.length || (productos ?? []).some((p) => !p.activo))
    return fallo("Hay productos que ya no están disponibles");

  const { data: venta, error: errVenta } = await supabase
    .from("ventas")
    .insert({
      organizacion_id: ctx.organizacionId,
      bodega_id: d.bodega_id,
      cliente_id: d.cliente_id,
      turno_id: turno.id,
      usuario_id: ctx.usuarioId,
      offline_id: d.offline_id,
      ...(d.creado_en ? { creado_en: d.creado_en } : {}),
      descuento: numericoBd(paraBd(d.descuento)),
      origen: "pos",
    })
    .select("id")
    .single();
  if (errVenta || !venta) {
    if (errVenta?.code === "23505") {
      const dup = await buscarPorOffline(supabase, ctx.organizacionId, d.offline_id);
      if (dup) return ok({ ...dup, duplicada: true, vuelto: "0.00", verificaciones: [] });
    }
    return fallo("No pudimos crear la venta");
  }

  const descartar = async () => void (await supabase.from("ventas").delete().eq("id", venta.id));

  const { error: errDet } = await supabase.from("ventas_detalle").insert(
    d.lineas.map((l) => ({
      organizacion_id: ctx.organizacionId,
      venta_id: venta.id,
      producto_id: l.producto_id,
      presentacion_id: l.presentacion_id,
      cantidad: numericoBd(cantidadParaBd(l.cantidad)),
      precio_unitario: numericoBd(paraBd(l.precio_unitario)),
      descuento: numericoBd(paraBd(l.descuento)),
    })),
  );
  if (errDet) {
    await descartar();
    return fallo("No pudimos guardar los productos de la venta");
  }

  const comprobantePorMetodo = new Map(d.pagos.map((p) => [p.metodo, p.comprobante_id]));
  const { data: pagosGuardados, error: errPagos } = await supabase.from("pagos_venta").insert(
    pagos.pagosParaBd.map((p) => ({
      organizacion_id: ctx.organizacionId,
      venta_id: venta.id,
      metodo: p.metodo as Database["public"]["Enums"]["metodo_pago"],
      monto: numericoBd(paraBd(p.monto)),
      comprobante_id: comprobantePorMetodo.get(p.metodo as never) ?? null,
    })),
  ).select("id, metodo, monto, comprobante_id");
  if (errPagos) {
    await descartar();
    return fallo("No pudimos guardar los pagos");
  }

  const { data: numero, error: errConf } = await supabase.rpc("confirmar_venta", {
    p_venta_id: venta.id,
  });
  if (errConf) {
    await descartar();
    return fallo(mensajeConfirmacion(errConf.message));
  }

  const verificaciones = await verificarPagos(supabase, pagosGuardados ?? []);
  if (d.cotizacion_id) {
    // La cotización queda vendida; si ya no estaba vigente no se bloquea la venta.
    await supabase.rpc("cambiar_estado_cotizacion", { p_cot: d.cotizacion_id, p_estado: "aceptada", p_venta: venta.id });
  }

  // Los precios de la lista del cliente cuentan como "precio de catálogo" para esta venta.
  const productosRef = (productos ?? []).map((p) => ({ ...p }));
  const presentacionesRef = (presentaciones ?? []).map((p) => ({ ...p }));
  if (d.cliente_id) {
    const { data: cli } = await supabase.from("clientes").select("lista_precios_id").eq("id", d.cliente_id).maybeSingle();
    if (cli?.lista_precios_id) {
      const { data: deLista } = await supabase.from("precios_lista").select("producto_id, presentacion_id, precio").eq("lista_id", cli.lista_precios_id).in("producto_id", ids);
      for (const x of deLista ?? []) {
        if (x.presentacion_id) {
          const r = presentacionesRef.find((p) => p.id === x.presentacion_id);
          if (r) r.precio_venta = x.precio;
        } else {
          const r = productosRef.find((p) => p.id === x.producto_id);
          if (r) r.precio_venta = x.precio;
        }
      }
    }
  }
  await auditarPrecios(supabase, venta.id, d.lineas, productosRef, presentacionesRef);

  return ok({ ventaId: venta.id, numero: Number(numero), duplicada: false, vuelto: paraBd(pagos.vuelto), verificaciones });
}

async function buscarPorOffline(supabase: Supabase, org: string, offlineId: string) {
  const { data } = await supabase
    .from("ventas")
    .select("id, numero, estado")
    .eq("organizacion_id", org)
    .eq("offline_id", offlineId)
    .maybeSingle();
  if (!data || data.estado !== "confirmado") return null;
  return { ventaId: data.id, numero: Number(data.numero) };
}

function mensajeConfirmacion(m: string): string {
  if (/stock|negativ|insuficiente/i.test(m)) return "No hay suficiente stock para esta venta";
  if (/suman el total/i.test(m)) return "Los pagos no coinciden con el total";
  if (/necesita cliente/i.test(m)) return "Para fiar elige un cliente";
  return "No pudimos confirmar la venta";
}

/** Si el vendedor cambió un precio respecto al catálogo, queda en auditoría (control de pérdidas). */
async function auditarPrecios(
  supabase: Supabase,
  ventaId: string,
  lineas: { producto_id: string; presentacion_id: string | null; precio_unitario: number }[],
  productos: { id: string; precio_venta: number }[],
  presentaciones: { id: string; precio_venta: number }[],
) {
  const cambios: Json[] = [];
  for (const l of lineas) {
    const catalogo = l.presentacion_id
      ? presentaciones.find((p) => p.id === l.presentacion_id)?.precio_venta
      : productos.find((p) => p.id === l.producto_id)?.precio_venta;
    if (catalogo !== undefined && !dinero(catalogo).eq(dinero(l.precio_unitario)))
      cambios.push({
        producto_id: l.producto_id,
        precio_catalogo: Number(catalogo),
        precio_cobrado: l.precio_unitario,
      });
  }
  if (!cambios.length) return;
  await supabase.rpc("registrar_cambio_precio", { p_venta: ventaId, p_cambios: cambios });
}

/**
 * Verifica cada pago con comprobante en SQL (repetido, monto, fecha) y lo marca.
 * Un pago electrónico sin comprobante queda "sin_verificar" para que el dueño lo revise.
 * Nunca falla la venta: la verificación es control, no bloqueo en el mostrador.
 */
async function verificarPagos(
  supabase: Supabase,
  pagos: { id: string; metodo: string; monto: number; comprobante_id: string | null }[],
): Promise<{ metodo: string; estado: string }[]> {
  const resultado: { metodo: string; estado: string }[] = [];
  for (const p of pagos) {
    if (!METODOS_CON_COMPROBANTE.includes(p.metodo)) continue;
    let estado: Database["public"]["Enums"]["estado_verificacion"] = "sin_verificar";
    if (p.comprobante_id) {
      const { data, error } = await supabase.rpc("verificar_comprobante", {
        p_comprobante: p.comprobante_id,
        p_monto_esperado: numericoBd(paraBd(p.monto)),
        p_pago: p.id,
      });
      if (!error && data) estado = data;
    }
    await supabase.rpc("marcar_verificacion_pago", { p_pago: p.id, p_estado: estado });
    resultado.push({ metodo: p.metodo, estado });
  }
  return resultado;
}
