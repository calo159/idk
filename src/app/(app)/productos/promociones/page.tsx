import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP } from "@/lib/dinero";
import { formatoFecha, hoyBogota, sumarDias } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { BotonTerminar, PanelNuevaPromocion } from "./panel";

export const metadata: Metadata = { title: "Promociones" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") redirect("/productos");
  const supabase = await crearClienteServidor();
  const hoy = hoyBogota();
  const [{ data: sugeridas }, { data: activas }] = await Promise.all([
    supabase.rpc("sugerir_promociones", { p_org: ctx.organizacionId, p_dias: 60 }),
    supabase.from("promociones").select("id, nombre, desde, hasta, promociones_productos(precio_normal, precio_promocional, productos(nombre))").eq("organizacion_id", ctx.organizacionId).eq("activa", true).gte("hasta", hoy).order("hasta"),
  ]);
  return (
    <section className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <Link href="/productos" className="text-sm text-muted-foreground underline">← Productos</Link>
      <h1 className="text-xl font-semibold">Promociones</h1>
      <p className="text-sm text-muted-foreground">Convierte la mercancía que no se mueve en plata. Te sugerimos descuentos que <strong>nunca bajan del costo</strong>, y el POS cobra el precio promocional solo mientras dure.</p>

      {(activas ?? []).length > 0 ? (
        <div className="space-y-2">
          <h2 className="font-medium">En curso</h2>
          <ul className="divide-y rounded-xl border text-sm">
            {(activas ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.nombre}</span>
                  <span className="block truncate text-xs text-muted-foreground">Hasta {formatoFecha(p.hasta)} · {p.promociones_productos.map((x) => `${x.productos?.nombre} ${formatoCOP(x.precio_promocional)}`).join(" · ")}</span>
                </span>
                <BotonTerminar id={p.id} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(sugeridas ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No tienes mercancía parada con margen para hacer promoción. ✔</p>
      ) : (
        <PanelNuevaPromocion
          negocio={ctx.negocio}
          hoy={hoy}
          fin={sumarDias(hoy, 14)}
          sugeridas={(sugeridas ?? []).map((s) => ({
            id: s.producto_id, nombre: s.producto, cantidad: Number(s.cantidad), costo: Number(s.costo), precioNormal: Number(s.precio_normal),
            dias: s.dias_sin_vender, descuento: Number(s.descuento_pct), precioSugerido: Number(s.precio_sugerido), inmovilizado: Number(s.valor_inmovilizado),
          }))}
        />
      )}
    </section>
  );
}
