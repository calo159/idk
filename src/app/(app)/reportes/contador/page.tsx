import type { Metadata } from "next";
import Link from "next/link";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoFecha } from "@/lib/fechas";
import { PERIODOS, type Periodo, esPeriodo, rangoPeriodo } from "@/lib/reportes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Para tu contador" };

const ARCHIVOS = [
  { tipo: "ventas", titulo: "Ventas", detalle: "Una fila por venta con cliente, total, costo y medios de pago" },
  { tipo: "compras", titulo: "Compras", detalle: "Facturas de proveedores con NIT y condición de pago" },
  { tipo: "gastos", titulo: "Gastos", detalle: "Servicios, arriendo, nómina y demás, con medio de pago" },
  { tipo: "por_pagar", titulo: "Cuentas por pagar", detalle: "Lo que se le debe a proveedores hoy (no depende del periodo)" },
  { tipo: "cartera", titulo: "Cartera (fiado)", detalle: "Lo que deben los clientes hoy (no depende del periodo)" },
  { tipo: "inventario", titulo: "Inventario valorizado", detalle: "Existencias a costo promedio hoy (no depende del periodo)" },
] as const;

export default async function Pagina({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin" && ctx.rol !== "contador") {
    return <p className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">Esta sección es para el dueño, los administradores y el contador.</p>;
  }
  const { periodo: pedido } = await searchParams;
  const periodo: Periodo = esPeriodo(pedido) ? pedido : "mes_anterior";
  const { desde, hasta } = rangoPeriodo(periodo);
  return (
    <section className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <Link href="/reportes" className="text-sm text-muted-foreground underline">← Reportes</Link>
      <h1 className="text-xl font-semibold">Para tu contador</h1>
      <p className="text-sm text-muted-foreground">
        Archivos listos para abrir en Excel. El contador entra con su propio usuario de solo lectura (Configuración → Usuarios → rol Contador).
      </p>
      <nav aria-label="Periodo" className="flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <Link key={p.valor} href={`/reportes/contador?periodo=${p.valor}`} aria-current={p.valor === periodo ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1.5 text-sm", p.valor === periodo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {p.etiqueta}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-muted-foreground">{formatoFecha(desde)} — {formatoFecha(hasta)}</p>
      <ul className="divide-y rounded-xl border">
        {ARCHIVOS.map((a) => (
          <li key={a.tipo} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{a.titulo}</span>
              <span className="block text-xs text-muted-foreground">{a.detalle}</span>
            </span>
            <a href={`/reportes/exportar?tipo=${a.tipo}&periodo=${periodo}`} download className="rounded-lg border px-3 py-2 text-sm text-primary hover:bg-muted">
              Descargar CSV
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
