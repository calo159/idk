import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { PROVEEDORES } from "@/server/facturacion/proveedores";
import { FormularioFacturacion } from "./panel";

export const metadata: Metadata = { title: "Facturación electrónica" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") redirect("/configuracion");
  const supabase = await crearClienteServidor();
  const [{ data: c }, { data: org }, { count: facturas }] = await Promise.all([
    supabase.from("config_facturacion").select("*").eq("organizacion_id", ctx.organizacionId).maybeSingle(),
    supabase.from("organizaciones").select("nit").eq("id", ctx.organizacionId).single(),
    supabase.from("facturas_electronicas").select("id", { count: "exact", head: true }).eq("organizacion_id", ctx.organizacionId),
  ]);
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href="/configuracion" className="text-sm text-muted-foreground underline">← Configuración</Link>
      <h1 className="text-xl font-semibold">Facturación electrónica</h1>
      <div className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
        <p className="font-medium">Todavía en pruebas</p>
        <p>
          Surtix ya arma la factura desde tus ventas (IVA, numeración, consumidor final) y la deja lista para enviar, pero el envío a la DIAN lo hace un
          <strong> proveedor tecnológico autorizado</strong> y ese enlace aún no está conectado. Con el proveedor «simulado» puedes practicar el proceso;
          <strong> esas facturas no tienen validez fiscal</strong>. Antes de facturar de verdad habla con tu contador.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">Para que el IVA salga bien, marca el IVA de cada producto (0 %, 5 % o 19 %) al editarlo. Se asume que tus precios ya lo incluyen.</p>
      <FormularioFacturacion
        proveedores={Object.keys(PROVEEDORES)}
        inicial={{
          activa: c?.activa ?? false,
          ambiente: (c?.ambiente as "pruebas" | "produccion") ?? "pruebas",
          proveedor: c?.proveedor ?? "simulado",
          nit: c?.nit ?? org?.nit?.replace(/\D/g, "") ?? "",
          dv: c?.dv ?? "",
          razonSocial: c?.razon_social ?? ctx.negocio,
          prefijo: c?.prefijo ?? "",
          resolucionNumero: c?.resolucion_numero ?? "",
          resolucionFecha: c?.resolucion_fecha ?? "",
          rangoDesde: c?.rango_desde ? String(c.rango_desde) : "",
          rangoHasta: c?.rango_hasta ? String(c.rango_hasta) : "",
          vigenciaHasta: c?.vigencia_hasta ?? "",
          consumidorFinalHasta: String(Math.round(Number(c?.consumidor_final_hasta ?? 261870))),
        }}
      />
      {facturas ? <p className="text-xs text-muted-foreground">{facturas} factura(s) emitidas hasta ahora. Cambiar el prefijo o el rango reinicia la numeración en el primer número del rango.</p> : null}
    </section>
  );
}
