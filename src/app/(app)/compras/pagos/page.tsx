import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP, sumar } from "@/lib/dinero";
import { formatoFecha } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { estadoVencimiento } from "@/lib/validaciones/ordenes";
import { FormPagoProveedor } from "./pagar";

export const metadata: Metadata = { title: "Cuentas por pagar" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("cuentas_por_pagar")
    .select("id, monto, saldo, vence, estado, compra_id, proveedores(nombre), compras(numero_factura)")
    .eq("organizacion_id", ctx.organizacionId)
    .eq("estado", "abierta")
    .order("vence");
  const filas = (data ?? []).map((x) => ({ ...x, v: estadoVencimiento(x.vence) }));
  const total = sumar(...filas.map((x) => x.saldo));
  const vencido = sumar(...filas.filter((x) => x.v === "vencida").map((x) => x.saldo));
  const puedePagar = ctx.rol === "dueno" || ctx.rol === "admin";

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href="/compras" className="text-sm text-muted-foreground underline">← Compras</Link>
      <h1 className="text-xl font-semibold">Cuentas por pagar</h1>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Total que debes</p><p className="text-lg font-semibold tabular-nums">{formatoCOP(total)}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Ya vencido</p><p className={`text-lg font-semibold tabular-nums ${vencido.gt(0) ? "text-destructive" : ""}`}>{formatoCOP(vencido)}</p></div>
      </div>
      <ul className="space-y-3">
        {filas.map((x) => (
          <li key={x.id} className="space-y-2 rounded-xl border p-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{x.proveedores?.nombre}</span>
              {x.v === "vencida" ? <Badge variant="destructive">Vencida</Badge> : x.v === "por_vencer" ? <Badge variant="secondary">Vence pronto</Badge> : null}
              <span className="tabular-nums font-medium">{formatoCOP(x.saldo)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Vence {formatoFecha(x.vence)} · de {formatoCOP(x.monto)}{x.compras?.numero_factura ? ` · Fact. ${x.compras.numero_factura}` : ""} ·{" "}
              <Link href={`/compras/${x.compra_id}`} className="underline">ver compra</Link>
            </p>
            {puedePagar ? <FormPagoProveedor cxpId={x.id} saldo={Number(x.saldo)} /> : null}
          </li>
        ))}
        {filas.length === 0 ? <li className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No debes nada a proveedores. ✔</li> : null}
      </ul>
    </section>
  );
}
