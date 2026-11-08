import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ProductoCatalogo } from "@/lib/catalogo";
import { SLUG_VALIDO } from "@/lib/catalogo";
import { crearClientePublico } from "@/lib/supabase/publico";
import { Catalogo } from "./catalogo";

// Página pública y cacheable: se regenera cada 5 minutos (precios, promociones y disponibilidad).
export const revalidate = 300;

async function cargar(slug: string) {
  if (!SLUG_VALIDO.test(slug) || slug.length > 40) return null;
  const supabase = crearClientePublico();
  const { data: cabecera } = await supabase.rpc("catalogo_publico", { p_slug: slug });
  const negocio = cabecera?.[0];
  if (!negocio) return null;
  const { data } = await supabase.rpc("catalogo_productos", { p_slug: slug });
  const productos: ProductoCatalogo[] = (data ?? []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    categoria: p.categoria,
    unidad: p.unidad,
    precio: Number(p.precio),
    precioAntes: p.precio_antes === null ? null : Number(p.precio_antes),
    disponible: p.disponible,
  }));
  return { negocio, productos };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = await cargar(slug);
  if (!c) return { title: "Catálogo no encontrado", robots: { index: false } };
  return { title: `Catálogo de ${c.negocio.nombre}`, description: `Mira los productos y precios de ${c.negocio.nombre} y haz tu pedido por WhatsApp.` };
}

export default async function Pagina({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await cargar(slug);
  if (!c) notFound();
  return <Catalogo negocio={c.negocio.nombre} telefono={c.negocio.telefono} mensaje={c.negocio.mensaje} productos={c.productos} />;
}
