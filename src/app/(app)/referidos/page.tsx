import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { entornoPublico } from "@/lib/env";
import { formatoFecha } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FormCodigoReferido } from "./codigo";

export const metadata: Metadata = { title: "Referidos" };

const MENSAJE = (codigo: string, enlace: string, negocio: string) =>
  `Uso Surtix para llevar el inventario, las ventas y los fiados de ${negocio} y me ha servido mucho. Pruébalo gratis con mi código ${codigo}: ${enlace}`;

/** ¿Se creó el negocio hace menos de 30 días? (el código de referido solo se acepta en ese plazo) */
function esReciente(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 30 * 86_400_000;
}

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") redirect("/dashboard");
  const supabase = await crearClienteServidor();
  const [{ data: org }, { data: lista }, { data: mio }] = await Promise.all([
    supabase.from("organizaciones").select("codigo_referido, creado_en").eq("id", ctx.organizacionId).single(),
    supabase.rpc("mis_referidos", { p_org: ctx.organizacionId }),
    supabase.from("referidos").select("estado").eq("referido_org", ctx.organizacionId).maybeSingle(),
  ]);
  const codigo = org?.codigo_referido ?? "";
  const enlace = `${entornoPublico().NEXT_PUBLIC_APP_URL}/registro?ref=${codigo}`;
  const convertidos = (lista ?? []).filter((r) => r.estado === "convertido");
  const dias = convertidos.reduce((t, r) => t + r.dias_ganados, 0);
  const reciente = org ? esReciente(org.creado_en) : false;

  return (
    <section className="mx-auto max-w-2xl space-y-5 px-4 py-6">
      <Link href="/configuracion" className="text-sm text-muted-foreground underline">← Configuración</Link>
      <h1 className="text-xl font-semibold">Recomienda Surtix, gana meses gratis</h1>
      <p className="text-sm text-muted-foreground">
        Por cada negocio que recomiendes y <strong>pague su suscripción</strong>, tú ganas <strong>30 días gratis</strong> y tu amigo también. Puedes ganar hasta 12 meses al año.
      </p>

      <div className="space-y-2 rounded-xl border p-5 text-center">
        <p className="text-xs text-muted-foreground">Tu código</p>
        <p className="text-3xl font-bold tracking-widest tabular-nums">{codigo}</p>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(MENSAJE(codigo, enlace, ctx.negocio))}`}
          target="_blank"
          rel="noreferrer"
          className="inline-block rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Compartir por WhatsApp
        </a>
        <p className="break-all text-xs text-muted-foreground">{enlace}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Registrados</p><p className="text-lg font-semibold tabular-nums">{(lista ?? []).length}</p></div>
        <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Ya pagaron</p><p className="text-lg font-semibold tabular-nums">{convertidos.length}</p></div>
        <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Días ganados</p><p className="text-lg font-semibold tabular-nums">{dias}</p></div>
      </div>

      {(lista ?? []).length > 0 ? (
        <ul className="divide-y rounded-xl border text-sm">
          {(lista ?? []).map((r, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.negocio}</span>
                <span className="block text-xs text-muted-foreground">Se registró el {formatoFecha(r.creado_en)}</span>
              </span>
              <span className={`shrink-0 text-xs ${r.estado === "convertido" ? "text-primary" : "text-muted-foreground"}`}>
                {r.estado === "convertido" ? `Pagó · +${r.dias_ganados} días` : "Probando"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aún no has recomendado a nadie. Comparte tu código con otro negocio.</p>
      )}

      {!mio && reciente && ctx.rol === "dueno" ? <FormCodigoReferido /> : null}
      {mio ? <p className="text-xs text-muted-foreground">Llegaste por una recomendación: cuando pagues tu primera suscripción recibes 30 días gratis.</p> : null}
    </section>
  );
}
