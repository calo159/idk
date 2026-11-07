import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { estadoCierre } from "@/lib/caja";
import { formatoCOP, sumar } from "@/lib/dinero";
import { formatoFechaHora } from "@/lib/fechas";
import { puede, puedeEscribir } from "@/lib/permisos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FormAbrirCaja, FormCerrarCaja } from "./formularios";
import { FormMovimientoCaja } from "./gastos/formularios";

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

  const { data: bodegasActivas } = await supabase
    .from("bodegas")
    .select("id, nombre")
    .eq("organizacion_id", ctx.organizacionId)
    .eq("activa", true)
    .order("es_principal", { ascending: false });

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

  // Señales de riesgo por turno (dueño, admin y contador). Son señales para revisar, no acusaciones.
  const riesgos = new Map<string, { puntaje: number; nivel: string; senales: { texto: string }[] }>();
  if (puede(ctx.rol, "riesgo.ver")) {
    const resultados = await Promise.all(
      historial.map((t) => supabase.rpc("riesgo_turno", { p_turno: t.id }).then((r) => [t.id, r.data] as const)),
    );
    for (const [id, data] of resultados)
      if (data && typeof data === "object" && !Array.isArray(data))
        riesgos.set(id, data as unknown as { puntaje: number; nivel: string; senales: { texto: string }[] });
  }

  return (
    <section className="mx-auto max-w-xl space-y-5 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Caja</h1>
        <Link href="/caja/gastos" className="text-sm text-primary underline">Gastos</Link>
      </div>

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
          <FormMovimientoCaja turnoId={turno.id} />
          <FormCerrarCaja turnoId={turno.id} />
        </>
      ) : (
        <FormAbrirCaja bodegas={bodegasActivas ?? []} />
      )}

      <div className="space-y-2">
        <h2 className="font-medium">Cierres recientes</h2>
        {historial.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay cierres.</p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {historial.map((t) => {
              const estado = estadoCierre(t.diferencia ?? 0);
              const riesgo = riesgos.get(t.id);
              return (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{nombres.get(t.usuario_id) ?? "Cajero"}</p>
                      <p className="text-xs text-muted-foreground">{t.cerrado_en ? formatoFechaHora(t.cerrado_en) : ""}</p>
                    </div>
                    {riesgo && riesgo.puntaje >= 25 ? (
                      <Badge variant={riesgo.nivel === "alto" ? "destructive" : "secondary"}>Riesgo {riesgo.nivel}</Badge>
                    ) : null}
                    <Badge variant={estado === "cuadra" ? "secondary" : "destructive"}>
                      {estado === "cuadra" ? "Cuadra" : estado === "faltante" ? "Faltante" : "Sobrante"}
                    </Badge>
                    <span className="tabular-nums">
                      {estado === "cuadra" ? formatoCOP(t.efectivo_contado ?? 0) : formatoCOP(t.diferencia ?? 0)}
                    </span>
                  </div>
                  {riesgo && riesgo.senales.length > 0 ? (
                    <details className="mt-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Señales a revisar ({riesgo.puntaje}/100)</summary>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5">
                        {riesgo.senales.map((sn) => (
                          <li key={sn.texto}>{sn.texto}</li>
                        ))}
                      </ul>
                      <p className="mt-1 italic">Son señales, no una acusación: confirma con la persona.</p>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
