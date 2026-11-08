import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { requerirContexto } from "@/lib/auth/contexto";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { BotonActivar, BotonCargarBase, FormTemporada } from "./formularios";

export const metadata: Metadata = { title: "Temporadas" };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (m: number, d: number) => `${d} ${MESES[m - 1]}`;

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin") redirect("/configuracion");
  const supabase = await crearClienteServidor();
  const [{ data: temporadas }, { data: categorias }] = await Promise.all([
    supabase.from("temporadas").select("id, nombre, mes_inicio, dia_inicio, mes_fin, dia_fin, factor, activa, categorias(nombre)").eq("organizacion_id", ctx.organizacionId).order("mes_inicio").order("dia_inicio"),
    supabase.from("categorias").select("id, nombre").eq("organizacion_id", ctx.organizacionId).order("nombre"),
  ]);
  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <Link href="/configuracion" className="text-sm text-muted-foreground underline">← Configuración</Link>
      <h1 className="text-xl font-semibold">Temporadas</h1>
      <p className="text-sm text-muted-foreground">Las fechas fuertes de tu negocio. Con ellas, las <Link href="/compras/sugerencias" className="text-primary underline">sugerencias de compra</Link> piden más mercancía antes de que empiece la temporada.</p>
      <BotonCargarBase />
      <ul className="divide-y rounded-xl border text-sm">
        {(temporadas ?? []).map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className={`block truncate font-medium ${t.activa ? "" : "text-muted-foreground line-through"}`}>{t.nombre}</span>
              <span className="block text-xs text-muted-foreground">{fecha(t.mes_inicio, t.dia_inicio)} – {fecha(t.mes_fin, t.dia_fin)}{t.categorias?.nombre ? ` · solo ${t.categorias.nombre}` : ""}</span>
            </span>
            <Badge variant="secondary">×{Number(t.factor).toString().replace(".", ",")}</Badge>
            <BotonActivar id={t.id} activa={t.activa} />
          </li>
        ))}
        {(temporadas ?? []).length === 0 ? <li className="px-4 py-8 text-center text-muted-foreground">Aún no tienes temporadas.</li> : null}
      </ul>
      <FormTemporada categorias={categorias ?? []} />
    </section>
  );
}
