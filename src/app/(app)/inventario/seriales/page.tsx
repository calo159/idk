import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoFecha } from "@/lib/fechas";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FormSeriales } from "../avanzado/formularios";

export const metadata: Metadata = { title: "Seriales y garantías" };

export default async function Pagina({ searchParams }: { searchParams: Promise<{ serial?: string }> }) {
  const ctx = await requerirContexto();
  const { serial } = await searchParams;
  const supabase = await crearClienteServidor();
  const [{ data: encontrado }, { data: productos }, { data: bodegas }] = await Promise.all([
    serial && serial.trim().length >= 3 ? supabase.rpc("consultar_serial", { p_org: ctx.organizacionId, p_serial: serial.trim().slice(0, 64) }) : Promise.resolve({ data: null }),
    puede(ctx.rol, "inventario.ajustar") ? supabase.from("productos").select("id, nombre").eq("organizacion_id", ctx.organizacionId).eq("activo", true).order("nombre").limit(3000) : Promise.resolve({ data: [] }),
    supabase.from("bodegas").select("id, nombre").eq("organizacion_id", ctx.organizacionId).eq("activa", true),
  ]);
  const s = encontrado?.[0];
  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <Link href="/inventario" className="text-sm text-muted-foreground underline">← Inventario</Link>
      <h1 className="text-xl font-semibold">Seriales y garantías</h1>
      <form className="flex gap-2" role="search">
        <input name="serial" defaultValue={serial ?? ""} aria-label="Buscar serial" placeholder="Escribe o escanea el serial" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm" />
        <button className="h-11 rounded-lg border px-4 text-sm">Consultar</button>
      </form>
      {serial ? (
        s ? (
          <div className="space-y-2 rounded-xl border p-4 text-sm">
            <div className="flex items-center gap-2"><span className="flex-1 font-medium">{s.producto}</span>
              <Badge variant={s.estado === "en_stock" ? "secondary" : "default"}>{s.estado === "en_stock" ? "En stock" : s.estado === "vendido" ? "Vendido" : "Devuelto"}</Badge></div>
            <p className="text-muted-foreground">Bodega: {s.bodega}</p>
            {s.comprado ? <p>Comprado el {formatoFecha(s.comprado)}{s.proveedor ? ` a ${s.proveedor}` : ""}</p> : null}
            {s.vendido ? <p>Vendido el {formatoFecha(s.vendido)}{s.cliente ? ` a ${s.cliente}` : ""}{s.venta_numero ? ` (venta #${s.venta_numero})` : ""}</p> : null}
            {s.garantia_hasta ? (
              <p className={s.en_garantia ? "font-medium text-primary" : "font-medium text-destructive"}>
                {s.en_garantia ? "✔ En garantía" : "✖ Garantía vencida"} hasta {formatoFecha(s.garantia_hasta)}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No encontramos ese serial en tu negocio.</p>
        )
      ) : null}
      {puede(ctx.rol, "inventario.ajustar") && (productos ?? []).length > 0 ? <FormSeriales productos={productos ?? []} bodegas={bodegas ?? []} /> : null}
    </section>
  );
}
