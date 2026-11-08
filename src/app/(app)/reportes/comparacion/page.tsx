import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { ETIQUETA_NICHO, MEDIDAS, esquemaBenchmark, posicion } from "@/lib/benchmark";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { InterruptorCompartir } from "./interruptor";

export const metadata: Metadata = { title: "Compárate con tu sector" };

const COLOR = { bien: "text-emerald-600 dark:text-emerald-400", regular: "text-amber-600 dark:text-amber-400", mal: "text-red-600 dark:text-red-400", neutral: "text-muted-foreground" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") redirect("/dashboard");
  const supabase = await crearClienteServidor();
  const { data } = await supabase.rpc("benchmark_nicho", { p_org: ctx.organizacionId });
  const b = esquemaBenchmark.safeParse(data);
  const resultado = b.success ? b.data : null;
  const grupo = ETIQUETA_NICHO[resultado?.nicho ?? ctx.nicho] ?? "negocios";
  const compartiendo = resultado?.compartiendo === true;

  return (
    <section className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <Link href="/reportes" className="text-sm text-muted-foreground underline">← Reportes</Link>
      <h1 className="text-xl font-semibold">Compárate con otras {grupo}</h1>
      <p className="text-sm text-muted-foreground">Mira cómo vas frente a negocios parecidos al tuyo, sin que nadie sepa quién es quién.</p>

      <div className="space-y-2 rounded-xl border p-4 text-sm">
        <p className="font-medium">Qué se comparte (y qué no)</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Solo 5 porcentajes o promedios: margen, días de inventario, deuda vencida, pérdidas y venta promedio.</li>
          <li><strong>Nunca</strong> tu nombre, tus ventas en pesos, tus productos ni tus clientes.</li>
          <li>Solo ves la comparación si compartes, y solo cuando hay al menos 6 negocios más en el grupo.</li>
          <li>Puedes salir cuando quieras: dejas de aparecer de inmediato.</li>
        </ul>
        <InterruptorCompartir activo={compartiendo} puedeCambiar={ctx.rol === "dueno"} />
      </div>

      {resultado && compartiendo && "sin_datos_propios" in resultado && resultado.sin_datos_propios ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aún no tenemos suficientes ventas tuyas este mes (mínimo 10) para compararte. Vuelve en unos días.</p>
      ) : null}
      {resultado && compartiendo && "cohorte_insuficiente" in resultado && resultado.cohorte_insuficiente ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Todavía no hay suficientes {grupo} compartiendo para comparar de forma anónima (hacen falta al menos 6 más). Ya estás dentro: te mostraremos la comparación apenas se complete el grupo. Mientras tanto, invita a otros negocios con tu <Link href="/referidos" className="underline">código de referido</Link>.
        </p>
      ) : null}

      {resultado && compartiendo && "razones" in resultado && resultado.razones ? (
        <>
          <p className="text-sm text-muted-foreground">Comparado con {resultado.negocios} {grupo} del grupo, en el último mes.</p>
          <ul className="space-y-3">
            {MEDIDAS.filter((m) => resultado.razones?.[m.clave]).map((m) => {
              const r = resultado.razones![m.clave]!;
              const p = posicion(m, r);
              return (
                <li key={m.clave} className="space-y-1 rounded-xl border p-4">
                  <p className="font-medium">{m.etiqueta}</p>
                  <p className="text-2xl font-semibold tabular-nums">{m.formato(r.tuyo)}</p>
                  <p className={`text-sm ${COLOR[p.tono]}`}>{p.texto}</p>
                  <p className="text-xs text-muted-foreground">El grupo: típico {m.formato(r.mediana)} · la mayoría entre {m.formato(r.p25)} y {m.formato(r.p75)}</p>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
