import type { Metadata } from "next";
import Link from "next/link";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP, sumar } from "@/lib/dinero";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cn } from "@/lib/utils";
import { PanelSugerencias } from "./panel";

export const metadata: Metadata = { title: "Sugerencias de compra" };

export default async function Pagina({ searchParams }: { searchParams: Promise<{ cobertura?: string; entrega?: string }> }) {
  const ctx = await requerirContexto();
  if (ctx.rol === "vendedor" || ctx.rol === "ruta") {
    return <p className="mx-auto max-w-md p-8 text-center text-sm text-muted-foreground">Las sugerencias de compra son para quien surte el negocio.</p>;
  }
  const sp = await searchParams;
  const cobertura = [7, 14, 21, 30].includes(Number(sp.cobertura)) ? Number(sp.cobertura) : 14;
  const entrega = [0, 1, 3, 5, 7].includes(Number(sp.entrega)) ? Number(sp.entrega) : 3;
  const supabase = await crearClienteServidor();
  const [{ data }, { data: proveedores }, { data: bodega }] = await Promise.all([
    supabase.rpc("sugerencia_compras", { p_org: ctx.organizacionId, p_cobertura: cobertura, p_entrega: entrega }),
    supabase.from("proveedores").select("id, nombre").eq("organizacion_id", ctx.organizacionId).eq("activo", true).order("nombre"),
    supabase.from("bodegas").select("id").eq("organizacion_id", ctx.organizacionId).eq("activa", true).order("es_principal", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const filas = (data ?? []).map((s) => ({
    productoId: s.producto_id, producto: s.producto, unidad: s.unidad, stock: Number(s.stock),
    diasRestantes: s.dias_restantes === null ? null : Number(s.dias_restantes), sugerida: Number(s.sugerida), urgencia: s.urgencia,
    proveedorId: s.proveedor_id, proveedor: s.proveedor, costo: Number(s.costo_estimado ?? 0),
  }));
  const criticas = filas.filter((f) => f.urgencia === "critica").length;
  const valor = sumar(...(data ?? []).map((s) => s.valor_estimado));
  const chip = (href: string, activo: boolean, t: string) => (
    <Link key={href} href={href} className={cn("rounded-full border px-3 py-1.5 text-sm", activo ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{t}</Link>
  );

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href="/compras" className="text-sm text-muted-foreground underline">← Compras</Link>
      <h1 className="text-xl font-semibold">Sugerencias de compra</h1>
      <p className="text-sm text-muted-foreground">Según lo que vendes, esto es lo que se te va a acabar y cuánto conviene comprar para cubrir {cobertura} días (más {entrega} de entrega).</p>
      <div className="flex flex-wrap gap-2" aria-label="Cobertura">
        {[7, 14, 21, 30].map((c) => chip(`/compras/sugerencias?cobertura=${c}&entrega=${entrega}`, c === cobertura, `Cubrir ${c} días`))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Se acaban antes de llegar</p><p className={cn("text-lg font-semibold tabular-nums", criticas > 0 && "text-destructive")}>{criticas}</p></div>
        <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Inversión estimada</p><p className="text-lg font-semibold tabular-nums">{formatoCOP(valor)}</p></div>
      </div>
      {filas.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Por ahora no necesitas reponer nada. ✔ (Se calcula con las ventas de los últimos 60 días.)</p>
      ) : (
        <PanelSugerencias filas={filas} proveedores={proveedores ?? []} bodegaId={bodega?.id ?? ""} puedeOrdenar={puede(ctx.rol, "compras.confirmar") && !!bodega} />
      )}
    </section>
  );
}
