import type { Metadata } from "next";
import Link from "next/link";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCantidad, formatoCOP, margenSobreVenta, sumar } from "@/lib/dinero";
import { formatoFecha } from "@/lib/fechas";
import { PERIODOS, type Periodo, esPeriodo, rangoPeriodo } from "@/lib/reportes";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reportes" };

const METODOS: Record<string, string> = {
  efectivo: "Efectivo", nequi: "Nequi", daviplata: "Daviplata", transferencia: "Transferencia",
  tarjeta: "Tarjeta", credito: "Fiado", otro: "Otro",
};

function Seccion({ titulo, tipo, periodo, children }: { titulo: string; tipo: string; periodo: Periodo; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{titulo}</h2>
        <a
          href={`/reportes/exportar?tipo=${tipo}&periodo=${periodo}`}
          className="text-xs text-primary underline"
          download
        >
          Descargar CSV
        </a>
      </div>
      {children}
    </section>
  );
}

export default async function Pagina({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin" && ctx.rol !== "contador") {
    return (
      <p className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">
        Los reportes son para el dueño, los administradores y el contador.
      </p>
    );
  }
  const { periodo: pedido } = await searchParams;
  const periodo: Periodo = esPeriodo(pedido) ? pedido : "7d";
  const { desde, hasta } = rangoPeriodo(periodo);
  const supabase = await crearClienteServidor();
  const args = { p_org: ctx.organizacionId, p_desde: desde, p_hasta: hasta };

  const [{ data: dias }, { data: productos }, { data: vendedores }, { data: metodos }] = await Promise.all([
    supabase.rpc("reporte_ventas_diarias", args),
    supabase.rpc("reporte_ventas_por_producto", { ...args, p_limite: 20 }),
    supabase.rpc("reporte_ventas_por_vendedor", args),
    supabase.rpc("reporte_ventas_por_metodo", args),
  ]);

  const total = sumar(...(dias ?? []).map((d) => d.total));
  const utilidad = sumar(...(dias ?? []).map((d) => d.utilidad));
  const nVentas = (dias ?? []).reduce((s, d) => s + Number(d.ventas), 0);
  const costo = sumar(...(dias ?? []).map((d) => d.costo));

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Reportes</h1>
        <span className="flex gap-3 text-sm"><Link href="/reportes/inventario" className="text-primary underline">Inventario</Link><Link href="/reportes/comisiones" className="text-primary underline">Comisiones</Link><Link href="/reportes/salud" className="text-primary underline">Salud</Link><Link href="/reportes/visitas" className="text-primary underline">Visitas</Link><Link href="/reportes/contador" className="text-primary underline">Contador</Link></span>
      </div>
      <nav aria-label="Periodo" className="flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p.valor}
            href={`/reportes?periodo=${p.valor}`}
            aria-current={p.valor === periodo ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              p.valor === periodo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {p.etiqueta}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-muted-foreground">
        {formatoFecha(desde)} — {formatoFecha(hasta)}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Ventas", formatoCOP(total)],
          ["N.º de ventas", String(nVentas)],
          ["Utilidad", formatoCOP(utilidad)],
          ["Margen", `${margenSobreVenta(total, costo).toString().replace(".", ",")} %`],
        ].map(([t, v]) => (
          <div key={t} className="rounded-xl border p-3">
            <p className="text-xs text-muted-foreground">{t}</p>
            <p className="text-lg font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <Seccion titulo="Ventas por día" tipo="dias" periodo={periodo}>
        <ul className="divide-y rounded-xl border text-sm">
          {(dias ?? []).filter((d) => Number(d.ventas) > 0).map((d) => (
            <li key={d.dia} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1">{formatoFecha(d.dia)}</span>
              <span className="text-xs text-muted-foreground">{d.ventas} venta(s)</span>
              <span className="font-medium tabular-nums">{formatoCOP(d.total)}</span>
            </li>
          ))}
          {nVentas === 0 ? <li className="px-4 py-6 text-center text-muted-foreground">Sin ventas en este periodo.</li> : null}
        </ul>
      </Seccion>

      <Seccion titulo="Productos más vendidos" tipo="productos" periodo={periodo}>
        <ul className="divide-y rounded-xl border text-sm">
          {(productos ?? []).map((p) => (
            <li key={p.producto_id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{p.nombre}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatoCantidad(p.cantidad)} u. · utilidad {formatoCOP(p.utilidad)}
                </span>
              </span>
              <span className="font-medium tabular-nums">{formatoCOP(p.ingreso)}</span>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Por vendedor" tipo="vendedores" periodo={periodo}>
        <ul className="divide-y rounded-xl border text-sm">
          {(vendedores ?? []).map((v) => (
            <li key={v.usuario_id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1">{v.nombre}</span>
              <span className="text-xs text-muted-foreground">{v.ventas} venta(s)</span>
              <span className="font-medium tabular-nums">{formatoCOP(v.total)}</span>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Por método de pago" tipo="metodos" periodo={periodo}>
        <ul className="divide-y rounded-xl border text-sm">
          {(metodos ?? []).map((m) => (
            <li key={m.metodo} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex-1">{METODOS[m.metodo] ?? m.metodo}</span>
              <span className="font-medium tabular-nums">{formatoCOP(m.total)}</span>
            </li>
          ))}
        </ul>
      </Seccion>
    </section>
  );
}
