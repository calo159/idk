import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCelular } from "@/lib/validaciones/comunes";
import { puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { BotonActivarProveedor, FormProveedor } from "./formularios";

export const metadata: Metadata = { title: "Proveedores" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  const supabase = await crearClienteServidor();
  const { data: proveedores } = await supabase
    .from("proveedores")
    .select("id, nombre, nit, telefono, contacto, activo")
    .eq("organizacion_id", ctx.organizacionId)
    .order("nombre");
  const editar = puedeEscribir(ctx.rol, "proveedores");

  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Proveedores</h1>
      {(proveedores ?? []).length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aún no tienes proveedores. Agrégalos aquí o se crearán al leer una factura.
        </p>
      ) : (
        <ul className="space-y-3">
          {(proveedores ?? []).map((p) => (
            <li key={p.id} className="rounded-xl border">
              <details>
                <summary className="flex cursor-pointer items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{p.nombre}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[p.telefono ? formatoCelular(p.telefono) : null, p.nit, p.contacto]
                        .filter(Boolean)
                        .join(" · ") || "Sin datos de contacto"}
                    </span>
                  </span>
                  {!p.activo ? <Badge variant="secondary">Inactivo</Badge> : null}
                </summary>
                {editar ? (
                  <div className="space-y-3 border-t p-4">
                    <FormProveedor proveedor={p} />
                    <BotonActivarProveedor id={p.id} activo={p.activo} />
                  </div>
                ) : null}
              </details>
            </li>
          ))}
        </ul>
      )}
      {editar ? <FormProveedor /> : null}
    </section>
  );
}
