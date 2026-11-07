import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { entornoPublico } from "@/lib/env";
import { etiquetaRol, puede } from "@/lib/permisos";
import { haceCuanto } from "@/lib/fechas";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { BotonActivar, BotonCancelar, FormInvitar, SelectorRol } from "./formularios";

export const metadata: Metadata = { title: "Usuarios y roles" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (!puede(ctx.rol, "usuarios.gestionar")) redirect("/configuracion");
  const supabase = await crearClienteServidor();

  const [{ data: miembros }, { data: invitaciones }] = await Promise.all([
    supabase
      .from("miembros")
      .select("usuario_id, nombre, rol, activo")
      .eq("organizacion_id", ctx.organizacionId)
      .order("creado_en"),
    supabase
      .from("invitaciones")
      .select("id, correo, rol, expira_en, creado_en")
      .eq("organizacion_id", ctx.organizacionId)
      .is("aceptada_en", null)
      .gt("expira_en", new Date().toISOString())
      .order("creado_en", { ascending: false }),
  ]);

  return (
    <section className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-semibold">Usuarios y roles</h1>

      <ul className="divide-y rounded-xl border">
        {(miembros ?? []).map((m) => {
          const esYo = m.usuario_id === ctx.usuarioId;
          // Solo un dueño puede tocar a otro dueño (lo exige también la base de datos).
          const bloqueado = esYo || (m.rol === "dueno" && ctx.rol !== "dueno");
          return (
            <li
              key={m.usuario_id}
              className="flex flex-wrap items-center justify-between gap-2 p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {m.nombre}
                  {esYo ? " (tú)" : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {etiquetaRol(m.rol)}
                  {m.activo ? "" : " · desactivado"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <SelectorRol miembroId={m.usuario_id} rol={m.rol} bloqueado={bloqueado} />
                <BotonActivar miembroId={m.usuario_id} activo={m.activo} bloqueado={bloqueado} />
              </div>
            </li>
          );
        })}
      </ul>

      {(invitaciones ?? []).length > 0 ? (
        <div className="space-y-2">
          <h2 className="font-medium">Invitaciones pendientes</h2>
          <ul className="divide-y rounded-xl border">
            {(invitaciones ?? []).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{i.correo}</span>
                  <span className="text-xs text-muted-foreground">
                    {etiquetaRol(i.rol)} · {haceCuanto(i.creado_en)}
                  </span>
                </span>
                <BotonCancelar invitacionId={i.id} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <FormInvitar urlBase={entornoPublico().NEXT_PUBLIC_APP_URL} />
    </section>
  );
}
