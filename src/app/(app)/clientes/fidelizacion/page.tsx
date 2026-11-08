import type { Metadata } from "next";
import Link from "next/link";
import { requerirContexto } from "@/lib/auth/contexto";
import { mensajeCumpleanos, mensajeInactivo } from "@/lib/fidelizacion";
import { destinoWhatsApp } from "@/lib/mensajes-eventos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FilaContacto, FormularioFidelizacion } from "./panel";

export const metadata: Metadata = { title: "Fidelización" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  const supabase = await crearClienteServidor();
  const [{ data: org }, { data: pendientes }] = await Promise.all([
    supabase.from("organizaciones").select("nombre, fidelizacion_activa, pesos_por_punto, valor_punto, puntos_cumpleanos").eq("id", ctx.organizacionId).single(),
    supabase.rpc("fidelizacion_pendiente", { p_org: ctx.organizacionId }),
  ]);
  const puedeConfigurar = ctx.rol === "dueno" || ctx.rol === "admin";
  const valorPunto = Number(org?.valor_punto ?? 0);
  const nombreNegocio = org?.nombre ?? "";
  const bono = org?.puntos_cumpleanos ?? 0;
  const lista = (tipo: "cumpleanos" | "inactivo") => (pendientes ?? []).filter((p) => p.tipo === tipo);
  const enlace = (tel: string | null, texto: string) => {
    const d = destinoWhatsApp(tel);
    return d ? `https://wa.me/${d}?text=${encodeURIComponent(texto)}` : null;
  };
  return (
    <section className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <Link href="/clientes" className="text-sm text-muted-foreground underline">← Clientes</Link>
      <h1 className="text-xl font-semibold">Fidelización</h1>
      <p className="text-sm text-muted-foreground">Tus clientes ganan puntos con cada compra (se identifican con su celular) y los canjean en el POS. Aquí también ves a quién saludar hoy y a quién hace tiempo no ves.</p>

      {puedeConfigurar && org ? (
        <FormularioFidelizacion inicial={{ activa: org.fidelizacion_activa, pesosPorPunto: Number(org.pesos_por_punto), valorPunto, puntosCumpleanos: bono }} />
      ) : null}

      <div className="space-y-2">
        <h2 className="font-medium">🎂 Cumpleaños de hoy</h2>
        {lista("cumpleanos").length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Nadie cumple años hoy.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {lista("cumpleanos").map((c) => (
              <FilaContacto key={c.cliente_id} clienteId={c.cliente_id} tipo="cumpleanos" nombre={c.nombre} detalle={`Regalo: ${bono} puntos al marcar «Ya escribí»`} enlace={enlace(c.telefono, mensajeCumpleanos(c.nombre, nombreNegocio, bono, valorPunto))} />
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="font-medium">👋 Hace tiempo no compran</h2>
        {lista("inactivo").length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Todos tus clientes frecuentes han vuelto recientemente. ✔</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {lista("inactivo").map((c) => (
              <FilaContacto key={c.cliente_id} clienteId={c.cliente_id} tipo="inactivo" nombre={c.nombre} detalle={`${c.dato} días sin comprar${c.puntos > 0 ? ` · ${c.puntos} puntos` : ""}`} enlace={enlace(c.telefono, mensajeInactivo(c.nombre, nombreNegocio, c.dato, c.puntos, valorPunto))} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
