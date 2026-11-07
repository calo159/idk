import { obtenerSesion } from "@/lib/auth/contexto";
import { aCSV, esPeriodo, rangoPeriodo } from "@/lib/reportes";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/** GET /reportes/exportar?tipo=dias|productos|vendedores|metodos&periodo=7d → CSV para Excel. */
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
  } else return new Response("Tipo inválido", { status: 400 });

  return new Response(aCSV(columnas, filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="surtix-${tipo}-${desde}_${hasta}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
