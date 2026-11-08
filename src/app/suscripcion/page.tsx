import type { Metadata } from "next";
import Link from "next/link";
import { requerirContexto } from "@/lib/auth/contexto";
import { formatoCOP } from "@/lib/dinero";
import { formatoFecha } from "@/lib/fechas";
import { ETIQUETA_ESTADO, estadoSeguro } from "@/lib/suscripcion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { ConfirmandoPago, ElegirPlan } from "./panel";

export const metadata: Metadata = { title: "Plan y pagos" };

const ESTADO_PAGO: Record<string, string> = { pendiente: "Pendiente", aprobado: "Aprobado", rechazado: "Rechazado", revision: "En revisión" };

/** Fuera del grupo (app): se puede entrar aunque la suscripción esté vencida, que es justo cuando hace falta. */
export default async function Pagina({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const ctx = await requerirContexto();
  const { id: transaccion } = await searchParams;
  const supabase = await crearClienteServidor();
  const [{ data: s }, { data: planes }, { data: pagos }] = await Promise.all([
    supabase.rpc("mi_suscripcion", { p_org: ctx.organizacionId }),
    supabase.from("planes").select("codigo, nombre, descripcion, precio_mensual, max_usuarios, max_bodegas").eq("activo", true).order("orden"),
    supabase.from("pagos_suscripcion").select("id, plan, meses, monto, estado, creado_en").eq("organizacion_id", ctx.organizacionId).order("creado_en", { ascending: false }).limit(10),
  ]);
  const sus = s?.[0];
  const estado = estadoSeguro(sus?.estado);
  const puedePagar = ctx.rol === "dueno" || ctx.rol === "admin";

  return (
    <main className="mx-auto min-h-dvh max-w-xl space-y-5 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Plan y pagos</h1>
        <Link href="/dashboard" className="text-sm text-muted-foreground underline">Volver al inicio</Link>
      </header>

      {transaccion && estado !== "activa" ? <ConfirmandoPago /> : null}
      {transaccion && estado === "activa" ? <p role="status" className="rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">¡Listo! Tu pago fue aprobado y tu suscripción está activa.</p> : null}

      {sus ? (
        <div className="space-y-1 rounded-xl border p-4 text-sm">
          <p className="text-xs text-muted-foreground">{ctx.negocio}</p>
          <p className="text-lg font-semibold">Plan {sus.plan_nombre} · {ETIQUETA_ESTADO[estado]}</p>
          <p className="text-muted-foreground">
            {estado === "prueba" ? `Tu prueba gratis termina el ${formatoFecha(sus.vigente_hasta)} (${sus.dias_restantes} días).` : estado === "activa" ? `Pagado hasta el ${formatoFecha(sus.vigente_hasta)} (${sus.dias_restantes} días).` : `Venció el ${formatoFecha(sus.vigente_hasta)}.`}
          </p>
          <p className="text-muted-foreground">{sus.usuarios} de {sus.max_usuarios ?? "∞"} usuarios · {sus.bodegas} de {sus.max_bodegas ?? "∞"} bodegas</p>
          {estado === "suspendida" && sus.motivo_suspension ? <p className="text-destructive">Motivo: {sus.motivo_suspension}</p> : null}
        </div>
      ) : null}

      {puedePagar ? (
        <ElegirPlan
          actual={sus?.plan ?? "negocio"}
          planes={(planes ?? []).map((p) => ({ codigo: p.codigo, nombre: p.nombre, descripcion: p.descripcion, precio: Number(p.precio_mensual), usuarios: p.max_usuarios, bodegas: p.max_bodegas }))}
        />
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Solo el dueño o un administrador puede pagar. Avísale para que renueve.</p>
      )}

      {(pagos ?? []).length > 0 ? (
        <div className="space-y-2">
          <h2 className="font-medium">Tus pagos</h2>
          <ul className="divide-y rounded-xl border text-sm">
            {(pagos ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span>{formatoFecha(p.creado_en)} · {p.plan} × {p.meses}</span>
                <span className="tabular-nums">{formatoCOP(p.monto)} · {ESTADO_PAGO[p.estado] ?? p.estado}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </main>
  );
}
