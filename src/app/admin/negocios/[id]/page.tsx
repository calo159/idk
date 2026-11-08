import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { formatoCOP } from "@/lib/dinero";
import { formatoFecha } from "@/lib/fechas";
import { ETIQUETA_ESTADO, estadoSeguro } from "@/lib/suscripcion";
import { requerirSuperAdmin } from "@/server/admin";
import { AccionesSoporte } from "./acciones-soporte";

export const metadata: Metadata = { title: "Negocio · Panel Surtix", robots: { index: false, follow: false } };

interface Detalle {
  negocio: { id: string; nombre: string; nicho: string; ciudad: string | null; nit: string | null; creado_en: string };
  suscripcion: { plan: string; plan_nombre: string; estado: string; vigente_hasta: string; dias_restantes: number; usuarios: number; max_usuarios: number | null; bodegas: number; max_bodegas: number | null; motivo_suspension: string | null } | null;
  miembros: { nombre: string; rol: string; activo: boolean; correo: string }[];
  pagos: { referencia: string; plan: string; meses: number; monto: number; estado: string; creado_en: string }[];
  uso: { productos: number; clientes: number; ventas_total: number; ventas_30d: number; ultima_venta: string | null };
  acciones: { accion: string; motivo: string; creado_en: string }[];
}

export default async function Pagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase } = await requerirSuperAdmin();
  const [{ data }, { data: planes }] = await Promise.all([
    supabase.rpc("admin_detalle_negocio", { p_org: id }),
    supabase.from("planes").select("codigo, nombre").order("orden"),
  ]);
  if (!data) notFound();
  const d = data as unknown as Detalle;
  const estado = estadoSeguro(d.suscripcion?.estado);
  return (
    <main className="mx-auto min-h-dvh max-w-3xl space-y-5 px-4 py-6">
      <Link href="/admin" className="text-sm text-muted-foreground underline">← Todos los negocios</Link>
      <header>
        <h1 className="text-xl font-semibold">{d.negocio.nombre}</h1>
        <p className="text-sm text-muted-foreground">{d.negocio.nicho} · {d.negocio.ciudad} · NIT {d.negocio.nit ?? "—"} · desde {formatoFecha(d.negocio.creado_en)}</p>
      </header>

      {d.suscripcion ? (
        <div className="space-y-1 rounded-xl border p-4 text-sm">
          <p className="text-lg font-semibold">Plan {d.suscripcion.plan_nombre} · {ETIQUETA_ESTADO[estado]}</p>
          <p>Vigente hasta {formatoFecha(d.suscripcion.vigente_hasta)} ({d.suscripcion.dias_restantes} días) · {d.suscripcion.usuarios}/{d.suscripcion.max_usuarios ?? "∞"} usuarios · {d.suscripcion.bodegas}/{d.suscripcion.max_bodegas ?? "∞"} bodegas</p>
          {d.suscripcion.motivo_suspension ? <p className="text-destructive">Suspendida: {d.suscripcion.motivo_suspension}</p> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
        {[["Productos", d.uso.productos], ["Clientes", d.uso.clientes], ["Ventas (total)", d.uso.ventas_total], ["Ventas (30 días)", d.uso.ventas_30d]].map(([t, v]) => (
          <div key={String(t)} className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{t}</p><p className="text-lg font-semibold tabular-nums">{v}</p></div>
        ))}
      </div>

      <AccionesSoporte org={id} planes={planes ?? []} suspendida={estado === "suspendida"} />

      <section className="space-y-2">
        <h2 className="font-medium">Equipo</h2>
        <ul className="divide-y rounded-xl border text-sm">
          {d.miembros.map((m) => <li key={m.correo} className="flex justify-between gap-3 px-4 py-2"><span>{m.nombre} <span className="text-muted-foreground">· {m.correo}</span></span><span className="text-xs">{m.rol}{m.activo ? "" : " (inactivo)"}</span></li>)}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Pagos</h2>
        {d.pagos.length === 0 ? <p className="text-sm text-muted-foreground">Sin pagos.</p> : (
          <ul className="divide-y rounded-xl border text-sm">
            {d.pagos.map((p) => <li key={p.referencia} className="flex justify-between gap-3 px-4 py-2"><span>{formatoFecha(p.creado_en)} · {p.plan} × {p.meses} · <span className="text-xs text-muted-foreground">{p.referencia}</span></span><span className="tabular-nums">{formatoCOP(p.monto)} · {p.estado}</span></li>)}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Bitácora de soporte</h2>
        {d.acciones.length === 0 ? <p className="text-sm text-muted-foreground">Sin acciones.</p> : (
          <ul className="divide-y rounded-xl border text-sm">
            {d.acciones.map((a, i) => <li key={i} className="px-4 py-2"><span className="font-medium">{a.accion}</span> · {formatoFecha(a.creado_en)}<span className="block text-xs text-muted-foreground">{a.motivo}</span></li>)}
          </ul>
        )}
      </section>
    </main>
  );
}
