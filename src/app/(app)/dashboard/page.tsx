import type { Metadata } from "next";
import Link from "next/link";
import { GraficoBarras } from "@/components/grafico-barras";
import { requerirContexto } from "@/lib/auth/contexto";
import { dinero, formatoCOP, sumar } from "@/lib/dinero";
import { formatoDiaLargo, haceCuanto, hoyBogota, sumarDias } from "@/lib/fechas";
import { estadoStock } from "@/lib/inventario";
import { variacionPorcentual } from "@/lib/reportes";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { ListaAlertas } from "./alertas";

export const metadata: Metadata = { title: "Inicio" };

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function Tarjeta({ titulo, valor, nota, href }: { titulo: string; valor: string; nota?: string; href?: string }) {
  const contenido = (
    <>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor}</p>
      {nota ? <p className="text-xs text-muted-foreground">{nota}</p> : null}
    </>
  );
  const clase = "rounded-xl border p-4";
  return href ? (
    <Link href={href} className={`${clase} hover:bg-muted/50`}>
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

export default async function Pagina() {
  const ctx = await requerirContexto();
  const supabase = await crearClienteServidor();
  const hoy = hoyBogota();
  const verTodo = ctx.rol === "dueno" || ctx.rol === "admin" || ctx.rol === "contador";

  if (!verTodo) {
    return (
      <section className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <h1 className="text-xl font-semibold">Hola, {ctx.nombre.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">{formatoDiaLargo(new Date())}</p>
        <div className="grid grid-cols-2 gap-3">
          {ctx.rol === "ruta" ? <Tarjeta titulo="Mi ruta de hoy" valor="Clientes por visitar" href="/ventas/ruta" /> : null}
          <Tarjeta titulo="Vender" valor="Abrir POS" href="/ventas/pos" />
          <Tarjeta titulo="Mi caja" valor="Abrir / cerrar" href="/caja" />
          <Tarjeta titulo="Mi avance del mes" valor="Meta y comisión" href="/reportes/comisiones" />
        </div>
      </section>
    );
  }

  const desde = sumarDias(hoy, -6);
  const [{ data: dias }, { data: top }, { data: clientes }, { data: productos }, { data: turnos }, { data: alertas }] =
    await Promise.all([
      supabase.rpc("reporte_ventas_diarias", { p_org: ctx.organizacionId, p_desde: desde, p_hasta: hoy }),
      supabase.rpc("reporte_ventas_por_producto", { p_org: ctx.organizacionId, p_desde: hoy, p_hasta: hoy, p_limite: 5 }),
      supabase.from("clientes").select("saldo").eq("organizacion_id", ctx.organizacionId).gt("saldo", 0),
      supabase
        .from("productos")
        .select("stock_minimo, maneja_inventario, existencias(cantidad)")
        .eq("organizacion_id", ctx.organizacionId)
        .eq("activo", true)
        .eq("maneja_inventario", true)
        .limit(5000),
      supabase
        .from("turnos_caja")
        .select("id, usuario_id, abierto_en")
        .eq("organizacion_id", ctx.organizacionId)
        .eq("estado", "abierto"),
      supabase
        .from("alertas")
        .select("id, mensaje, severidad, creado_en")
        .eq("organizacion_id", ctx.organizacionId)
        .eq("leida", false)
        .order("creado_en", { ascending: false })
        .limit(8),
    ]);

  const serie = dias ?? [];
  const delDia = serie.find((d) => d.dia === hoy);
  const ayer = serie.find((d) => d.dia === sumarDias(hoy, -1));
  const totalHoy = dinero(delDia?.total ?? 0);
  const variacion = variacionPorcentual(totalHoy, ayer?.total ?? 0);
  const porCobrar = sumar(...(clientes ?? []).map((c) => c.saldo));
  const porReponer = (productos ?? []).filter((p) => {
    const e = estadoStock(sumar(...p.existencias.map((x) => x.cantidad)), p.stock_minimo);
    return e === "bajo" || e === "agotado";
  }).length;

  return (
    <section className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header>
        <h1 className="text-xl font-semibold">{ctx.negocio}</h1>
        <p className="text-sm text-muted-foreground">{formatoDiaLargo(new Date())}</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Tarjeta
          titulo="Ventas de hoy"
          valor={formatoCOP(totalHoy)}
          nota={`${delDia?.ventas ?? 0} venta(s)${
            variacion === null ? "" : ` · ${variacion >= 0 ? "▲" : "▼"} ${Math.abs(variacion)} % vs ayer`
          }`}
          href="/ventas/historial"
        />
        <Tarjeta titulo="Utilidad de hoy" valor={formatoCOP(delDia?.utilidad ?? 0)} href="/reportes" />
        <Tarjeta titulo="Por cobrar (fiado)" valor={formatoCOP(porCobrar)} href="/clientes?deuda=1" />
        <Tarjeta
          titulo="Por reponer"
          valor={`${porReponer} producto(s)`}
          href="/inventario?filtro=bajo"
        />
      </div>

      <Link href="/asistente" className="flex items-center gap-3 rounded-xl border p-4 hover:bg-muted/50">
        <span className="text-2xl" aria-hidden>💬</span>
        <span>
          <span className="block font-medium">Pregúntale a tu negocio</span>
          <span className="text-sm text-muted-foreground">«¿Cuál fue mi producto más rentable este mes?»</span>
        </span>
      </Link>

      <div className="rounded-xl border p-4">
        <GraficoBarras
          titulo="Ventas de los últimos 7 días"
          puntos={serie.map((d) => {
            const [a, m, dd] = d.dia.split("-").map(Number);
            const dow = new Date(Date.UTC(a!, m! - 1, dd!)).getUTCDay();
            return {
              etiqueta: d.dia === hoy ? "hoy" : DIAS[dow]!,
              valor: Number(d.total),
              descripcion: `${d.dia}: ${formatoCOP(d.total)} en ${d.ventas} venta(s)`,
              destacado: d.dia === hoy,
            };
          })}
        />
      </div>

      <div className="space-y-2">
        <h2 className="font-medium">Caja</h2>
        {(turnos ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay cajas abiertas.</p>
        ) : (
          <p className="text-sm">
            {(turnos ?? []).length} caja(s) abierta(s). La más antigua abrió {haceCuanto((turnos ?? [])[0]!.abierto_en)}.
          </p>
        )}
        <Link href="/caja" className="text-sm text-primary underline">
          Ver cierres
        </Link>
      </div>

      {(top ?? []).length > 0 ? (
        <div className="space-y-2">
          <h2 className="font-medium">Lo más vendido hoy</h2>
          <ul className="divide-y rounded-xl border text-sm">
            {(top ?? []).map((p) => (
              <li key={p.producto_id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
                <span className="text-xs text-muted-foreground">{Number(p.cantidad)} u.</span>
                <span className="font-medium tabular-nums">{formatoCOP(p.ingreso)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="font-medium">Alertas</h2>
        {(alertas ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Sin alertas pendientes. Todo en orden ✔
          </p>
        ) : (
          <ListaAlertas
            puedeMarcar={ctx.rol === "dueno" || ctx.rol === "admin"}
            alertas={(alertas ?? []).map((a) => ({
              id: a.id,
              mensaje: a.mensaje,
              severidad: a.severidad,
              cuando: haceCuanto(a.creado_en),
            }))}
          />
        )}
      </div>
    </section>
  );
}
