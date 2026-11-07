import { obtenerSesion } from "@/lib/auth/contexto";
import { finDiaBogota, formatoFechaHora, inicioDiaBogota } from "@/lib/fechas";
import { aCSV, esPeriodo, rangoPeriodo } from "@/lib/reportes";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/**
 * GET /reportes/exportar?tipo=…&periodo=7d → CSV para Excel.
 * Tipos: dias, productos, vendedores, metodos, ventas, compras, gastos, inventario, cartera, por_pagar.
 */
export async function GET(req: Request) {
  const sesion = await obtenerSesion();
  if (sesion.estado !== "listo") return new Response("No autorizado", { status: 401 });
  const ctx = sesion.contexto;
  if (ctx.rol !== "dueno" && ctx.rol !== "admin" && ctx.rol !== "contador")
    return new Response("Sin permiso", { status: 403 });

  const url = new URL(req.url);
  const periodo = url.searchParams.get("periodo") ?? "7d";
  const tipo = url.searchParams.get("tipo");
  if (!esPeriodo(periodo)) return new Response("Periodo inválido", { status: 400 });
  const { desde, hasta } = rangoPeriodo(periodo);
  const supabase = await crearClienteServidor();
  const args = { p_org: ctx.organizacionId, p_desde: desde, p_hasta: hasta };

  let columnas: string[];
  let filas: unknown[][];
  if (tipo === "dias") {
    const { data } = await supabase.rpc("reporte_ventas_diarias", args);
    columnas = ["Día", "Ventas", "Total", "Costo", "Utilidad"];
    filas = (data ?? []).map((d) => [d.dia, d.ventas, d.total, d.costo, d.utilidad]);
  } else if (tipo === "productos") {
    const { data } = await supabase.rpc("reporte_ventas_por_producto", { ...args, p_limite: 500 });
    columnas = ["Producto", "Cantidad", "Ingreso", "Costo", "Utilidad"];
    filas = (data ?? []).map((p) => [p.nombre, p.cantidad, p.ingreso, p.costo, p.utilidad]);
  } else if (tipo === "vendedores") {
    const { data } = await supabase.rpc("reporte_ventas_por_vendedor", args);
    columnas = ["Vendedor", "Ventas", "Total", "Utilidad"];
    filas = (data ?? []).map((v) => [v.nombre, v.ventas, v.total, v.utilidad]);
  } else if (tipo === "metodos") {
    const { data } = await supabase.rpc("reporte_ventas_por_metodo", args);
    columnas = ["Método", "Pagos", "Total"];
    filas = (data ?? []).map((m) => [m.metodo, m.pagos, m.total]);
  } else if (tipo === "ventas") {
    // Detalle para el contador: una fila por venta confirmada, con IVA no discriminado (Fase 4: DIAN).
    const { data } = await supabase
      .from("ventas")
      .select("numero, creado_en, total, descuento, costo_total, estado, clientes(nombre, documento), pagos_venta(metodo, monto)")
      .eq("organizacion_id", ctx.organizacionId)
      .gte("creado_en", inicioDiaBogota(desde).toISOString())
      .lte("creado_en", finDiaBogota(hasta).toISOString())
      .neq("estado", "borrador")
      .order("numero")
      .limit(20000);
    columnas = ["Número", "Fecha", "Estado", "Cliente", "Documento", "Total", "Descuento", "Costo", "Medios de pago"];
    filas = (data ?? []).map((v) => [
      v.numero, formatoFechaHora(v.creado_en), v.estado, v.clientes?.nombre ?? "Mostrador", v.clientes?.documento ?? "",
      v.total, v.descuento, v.costo_total, v.pagos_venta.map((x) => `${x.metodo} ${x.monto}`).join(" + "),
    ]);
  } else if (tipo === "compras") {
    const { data } = await supabase
      .from("compras")
      .select("fecha, numero_factura, total, estado, condicion_pago, proveedores(nombre, nit)")
      .eq("organizacion_id", ctx.organizacionId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .neq("estado", "borrador")
      .order("fecha")
      .limit(20000);
    columnas = ["Fecha", "Factura", "Proveedor", "NIT", "Total", "Estado", "Pago"];
    filas = (data ?? []).map((c) => [c.fecha, c.numero_factura ?? "", c.proveedores?.nombre ?? "", c.proveedores?.nit ?? "", c.total, c.estado, c.condicion_pago]);
  } else if (tipo === "gastos") {
    const { data } = await supabase
      .from("gastos")
      .select("fecha, categoria, descripcion, monto, metodo, estado")
      .eq("organizacion_id", ctx.organizacionId)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha")
      .limit(20000);
    columnas = ["Fecha", "Categoría", "Descripción", "Monto", "Medio de pago", "Estado"];
    filas = (data ?? []).map((g) => [g.fecha, g.categoria, g.descripcion, g.monto, g.metodo, g.estado]);
  } else if (tipo === "inventario") {
    const { data } = await supabase.rpc("reporte_inventario_valorizado", { p_org: ctx.organizacionId });
    columnas = ["Producto", "Categoría", "Cantidad", "Costo promedio", "Valor"];
    filas = (data ?? []).map((p) => [p.nombre, p.categoria, p.cantidad, p.costo_promedio, p.valor]);
  } else if (tipo === "cartera") {
    const { data } = await supabase
      .from("clientes")
      .select("nombre, documento, telefono, cupo_credito, saldo")
      .eq("organizacion_id", ctx.organizacionId)
      .gt("saldo", 0)
      .order("saldo", { ascending: false });
    columnas = ["Cliente", "Documento", "Teléfono", "Cupo", "Saldo por cobrar"];
    filas = (data ?? []).map((c) => [c.nombre, c.documento ?? "", c.telefono ?? "", c.cupo_credito, c.saldo]);
  } else if (tipo === "por_pagar") {
    const { data } = await supabase
      .from("cuentas_por_pagar")
      .select("monto, saldo, vence, estado, proveedores(nombre, nit)")
      .eq("organizacion_id", ctx.organizacionId)
      .eq("estado", "abierta")
      .order("vence");
    columnas = ["Proveedor", "NIT", "Valor original", "Saldo", "Vence"];
    filas = (data ?? []).map((x) => [x.proveedores?.nombre ?? "", x.proveedores?.nit ?? "", x.monto, x.saldo, x.vence]);
  } else return new Response("Tipo inválido", { status: 400 });

  return new Response(aCSV(columnas, filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="surtix-${tipo}-${desde}_${hasta}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
