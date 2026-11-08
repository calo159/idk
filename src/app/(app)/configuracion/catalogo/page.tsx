import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FormularioCatalogo, ListaVisibilidad } from "./panel";

export const metadata: Metadata = { title: "Catálogo web" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") redirect("/configuracion");
  const supabase = await crearClienteServidor();
  const [{ data: org }, { data: productos }, cabeceras] = await Promise.all([
    supabase.from("organizaciones").select("nombre, catalogo_activo, catalogo_slug, catalogo_telefono, catalogo_mensaje, telefono_whatsapp").eq("id", ctx.organizacionId).single(),
    supabase.from("productos").select("id, nombre, en_catalogo, precio_venta").eq("organizacion_id", ctx.organizacionId).eq("activo", true).order("nombre").limit(1500),
    headers(),
  ]);
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host") ?? "";
  const protocolo = cabeceras.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const sinPrecio = (productos ?? []).filter((p) => Number(p.precio_venta) <= 0).length;
  return (
    <section className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <Link href="/configuracion" className="text-sm text-muted-foreground underline">← Configuración</Link>
      <h1 className="text-xl font-semibold">Catálogo web</h1>
      <p className="text-sm text-muted-foreground">Un enlace para compartir en WhatsApp, Instagram o Facebook. Tus clientes ven productos y precios (con tus ofertas), arman su lista y te la envían por WhatsApp. <strong>Nunca se muestran costos ni cantidades exactas.</strong></p>
      {org ? (
        <FormularioCatalogo
          nombreNegocio={org.nombre}
          origen={host ? `${protocolo}://${host}` : ""}
          inicial={{ activo: org.catalogo_activo, slug: org.catalogo_slug ?? "", telefono: org.catalogo_telefono ?? org.telefono_whatsapp ?? "", mensaje: org.catalogo_mensaje ?? "" }}
        />
      ) : null}
      {sinPrecio > 0 ? <p className="text-xs text-muted-foreground">{sinPrecio} producto(s) sin precio no aparecen en el catálogo.</p> : null}
      <ListaVisibilidad productos={(productos ?? []).map((p) => ({ id: p.id, nombre: p.nombre, visible: p.en_catalogo && Number(p.precio_venta) > 0 }))} />
    </section>
  );
}
