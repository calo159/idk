import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP } from "@/lib/dinero";
import { puede } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { zUuid } from "@/lib/validaciones/comunes";
import { AccionesCierreConteo, type LineaConteo, ListaConteo } from "../formularios";

export const metadata: Metadata = { title: "Conteo" };

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requerirContexto();
  const { id } = await params;
  if (!zUuid.safeParse(id).success) notFound();
  const supabase = await crearClienteServidor();
  const [{ data: conteo }, { data: detalle }] = await Promise.all([
    supabase.from("conteos").select("id, nombre, estado, ajustes_aplicados, bodegas(nombre)").eq("id", id).eq("organizacion_id", ctx.organizacionId).maybeSingle(),
    supabase.from("conteos_detalle").select("producto_id, cantidad_contada, cantidad_sistema, costo_unitario, productos(nombre, unidad_base)").eq("conteo_id", id),
  ]);
  if (!conteo) notFound();
  const abierto = conteo.estado === "en_curso";
  const verSistema = !abierto && (ctx.rol === "dueno" || ctx.rol === "admin" || ctx.rol === "contador");

  const lineas: LineaConteo[] = (detalle ?? [])
    .map((d) => ({
      productoId: d.producto_id,
      nombre: d.productos?.nombre ?? "",
      unidad: d.productos?.unidad_base ?? "",
      contada: d.cantidad_contada === null ? null : Number(d.cantidad_contada),
      // Nunca se manda el dato del sistema mientras se cuenta: el conteo es ciego.
      sistema: verSistema && d.cantidad_sistema !== null ? Number(d.cantidad_sistema) : null,
      costo: verSistema && d.costo_unitario !== null ? Number(d.costo_unitario) : null,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const contadas = lineas.filter((l) => l.contada !== null).length;
  const conDiferencia = lineas.filter((l) => l.sistema !== null && l.contada !== null && l.contada !== l.sistema);
  const valorFaltante = conDiferencia.reduce((s, l) => (l.contada! < l.sistema! ? s + (l.sistema! - l.contada!) * (l.costo ?? 0) : s), 0);
  const valorSobrante = conDiferencia.reduce((s, l) => (l.contada! > l.sistema! ? s + (l.contada! - l.sistema!) * (l.costo ?? 0) : s), 0);

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href="/inventario/conteos" className="text-sm text-muted-foreground underline">← Conteos</Link>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{conteo.nombre}</h1>
        <Badge variant={abierto ? "default" : "secondary"}>{abierto ? "En curso" : conteo.estado === "cerrado" ? "Cerrado" : "Cancelado"}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{conteo.bodegas?.nombre} · {contadas} de {lineas.length} productos contados</p>

      {verSistema && conteo.estado === "cerrado" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Faltante (a costo)</p><p className="text-lg font-semibold tabular-nums text-destructive">{formatoCOP(valorFaltante)}</p></div>
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Sobrante (a costo)</p><p className="text-lg font-semibold tabular-nums">{formatoCOP(valorSobrante)}</p></div>
        </div>
      ) : null}

      <ListaConteo conteoId={conteo.id} lineas={lineas} abierto={abierto} />
      {abierto && puede(ctx.rol, "ventas.anular") ? <AccionesCierreConteo conteoId={conteo.id} /> : null}
    </section>
  );
}
