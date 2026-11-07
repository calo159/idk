import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { estadoCierre } from "@/lib/caja";
import { formatoCOP, sumar } from "@/lib/dinero";
import { formatoFechaHora } from "@/lib/fechas";
import { puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FormAbrirCaja, FormCerrarCaja } from "./formularios";

export const metadata: Metadata = { title: "Caja" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  const supabase = await crearClienteServidor();
  const veTodo = ctx.rol === "dueno" || ctx.rol === "admin" || ctx.rol === "contador";
  const maneja = puedeEscribir(ctx.rol, "turnos_caja");

  const { data: turno } = await supabase
    .from("turnos_caja")
    .select("id, base_inicial, abierto_en")
    .eq("organizacion_id", ctx.organizacionId)
    .eq("usuario_id", ctx.usuarioId)
    .eq("estado", "abierto")
    .maybeSingle();

  // Resumen del turno abierto: ventas por método (SIN mostrar el efectivo esperado: el cierre es "ciego").
  let ventasTurno: { metodo: string; monto: number }[] = [];
  let nVentas = 0;
  if (turno) {
    const { data: ventas } = await supabase
      .from("ventas")
      .select("id, pagos_venta(metodo, monto)")
      .eq("turno_id", turno.id)
      .eq("estado", "confirmado");
    nVentas = (ventas ?? []).length;
    const porMetodo = new Map<string, number[]>();
    for (const v of ventas ?? [])
      for (const p of v.pagos_venta) porMetodo.set(p.metodo, [...(porMetodo.get(p.metodo) ?? []), Number(p.monto)]);
    ventasTurno = [...porMetodo].map(([metodo, montos]) => ({ metodo, monto: sumar(...montos).toNumber() }));
  }

  const { data: cerrados } = await supabase
    .from("turnos_caja")
    .select("id, usuario_id, abierto_en, cerrado_en, efectivo_esperado, efectivo_contado, diferencia")
    .eq("organizacion_id", ctx.organizacionId)
    .eq("estado", "cerrado")
    .order("cerrado_en", { ascending: false })
    .limit(20);
  const historial = (cerrados ?? []).filter((t) => veTodo || t.usuario_id === ctx.usuarioId);
  const { data: miembros } = await supabase
    .from("miembros")
    .select("usuario_id, nombre")
    .eq("organizacion_id", ctx.organizacionId);
  const nombres = new Map((miembros ?? []).map((m) => [m.usuario_id, m.nombre]));

  return (
    <section className="mx-auto max-w-xl space-y-5 px-4 py-6">
      <h1 className="text-xl font-semibold">Caja</h1>

      {!maneja ? (
        <p className="text-sm text-muted-foreground">Tu rol no abre caja; aquí ves el historial de cierres.</p>
      ) : turno ? (
        <>
          <div className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">
              Abierta desde {formatoFechaHora(turno.abierto_en)} · base {formatoCOP(turno.base_inicial)}
            </p>
            <p className="mt-1 text-lg font-semibold">{nVentas} venta(s) en este turno</p>
            <ul className="mt-2 space-y-1 text-sm">
              {ventasTurno.map((v) => (
                <li key={v.metodo} className="flex justify-between">
                  <span className="capitalize">{v.metodo}</span>
                  <span className="tabular-nums">{formatoCOP(v.monto)}</span>
                </li>
              ))}
            </ul>
            <Link href="/ventas/pos" className="mt-3 inline-block text-sm text-primary underline">
              Ir a vender
            </Link>
          </div>
          <FormCerrarCaja turnoId={turno.id} />
        </>
      ) : (
        <FormAbrirCaja />
      )}

      <div className="space-y-2">
        <h2 className="font-medium">Cierres recientes</h2>
        {historial.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay cierres.</p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {historial.map((t) => {
              const estado = estadoCierre(t.diferencia ?? 0);
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{nombres.get(t.usuario_id) ?? "Cajero"}</p>
                    <p className="text-xs text-muted-foreground">{t.cerrado_en ? formatoFechaHora(t.cerrado_en) : ""}</p>
                  </div>
                  <Badge variant={estado === "cuadra" ? "secondary" : "destructive"}>
                    {estado === "cuadra" ? "Cuadra" : estado === "faltante" ? "Faltante" : "Sobrante"}
                  </Badge>
                  <span className="tabular-nums">
                    {estado === "cuadra" ? formatoCOP(t.efectivo_contado ?? 0) : formatoCOP(t.diferencia ?? 0)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
