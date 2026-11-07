import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { BotonActivarBodega, FormBodega } from "./formularios";

export const metadata: Metadata = { title: "Bodegas" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "bodegas")) redirect("/configuracion");
  const supabase = await crearClienteServidor();
  const { data: bodegas } = await supabase
    .from("bodegas")
    .select("id, nombre, es_principal, activa")
    .eq("organizacion_id", ctx.organizacionId)
    .order("es_principal", { ascending: false })
    .order("nombre");
  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <Link href="/configuracion" className="text-sm text-muted-foreground underline">← Configuración</Link>
      <h1 className="text-xl font-semibold">Bodegas y sedes</h1>
      <p className="text-sm text-muted-foreground">
        Cada bodega tiene su propio stock. Mueve mercancía entre ellas con un <Link href="/inventario/traslados" className="text-primary underline">traslado</Link>.
      </p>
      <ul className="divide-y rounded-xl border text-sm">
        {(bodegas ?? []).map((b) => (
          <li key={b.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex-1 font-medium">{b.nombre}</span>
            {b.es_principal ? <Badge variant="secondary">Principal</Badge> : null}
            {!b.activa ? <Badge variant="destructive">Inactiva</Badge> : null}
            {!b.es_principal ? <BotonActivarBodega id={b.id} activa={b.activa} /> : null}
          </li>
        ))}
      </ul>
      <FormBodega />
    </section>
  );
}
