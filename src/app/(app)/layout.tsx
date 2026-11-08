import Link from "next/link";
import type { ReactNode } from "react";
import { cerrarSesion } from "@/app/(auth)/acciones";
import { BarraInferior } from "@/components/layout/barra-inferior";
import { BarraLateral } from "@/components/layout/barra-lateral";
import { Encabezado } from "@/components/layout/encabezado";
import { requerirContexto } from "@/lib/auth/contexto";
import { etiquetaRol } from "@/lib/permisos";
import { avisoSuscripcion, bloqueaApp, estadoSeguro } from "@/lib/suscripcion";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/** Estructura de las pantallas protegidas: lateral en escritorio, barra inferior en celular. */
export default async function LayoutApp({ children }: { children: ReactNode }) {
  const ctx = await requerirContexto();
  // Si la consulta falla NO se bloquea a nadie: un error nuestro no puede dejar a un negocio sin su caja.
  const { data } = await (await crearClienteServidor()).rpc("mi_suscripcion", { p_org: ctx.organizacionId });
  const sus = data?.[0];
  const estado = estadoSeguro(sus?.estado);
  const bloqueado = bloqueaApp(estado);
  const aviso = avisoSuscripcion(estado, sus?.dias_restantes ?? 99, sus?.motivo_suspension);
  const puedePagar = ctx.rol === "dueno" || ctx.rol === "admin";
  return (
    <div className="flex min-h-dvh">
      <BarraLateral />
      <div className="flex min-w-0 flex-1 flex-col">
        <Encabezado
          negocio={ctx.negocio}
          acciones={
            <form action={cerrarSesion} className="flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {ctx.nombre} · {etiquetaRol(ctx.rol)}
              </span>
              <button
                type="submit"
                className="min-h-9 rounded-lg border px-3 text-xs font-medium hover:bg-muted"
              >
                Salir
              </button>
            </form>
          }
        />
        {aviso && !bloqueado ? (
          <div role="status" className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm ${aviso.tipo === "alerta" ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-muted"}`}>
            <span>{aviso.texto}</span>
            {puedePagar ? <Link href="/suscripcion" className="font-medium underline">Elegir plan</Link> : null}
          </div>
        ) : null}
        <main id="contenido" className="flex-1 pb-28 md:pb-8">
          {bloqueado ? (
            <section className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
              <h1 className="text-xl font-semibold">{estado === "suspendida" ? "Cuenta suspendida" : "Tu suscripción venció"}</h1>
              <p className="text-sm text-muted-foreground">{aviso?.texto}</p>
              {puedePagar ? (
                <Link href="/suscripcion" className="inline-block rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground">Renovar ahora</Link>
              ) : (
                <p className="text-sm">Avísale al dueño o administrador del negocio para que renueve.</p>
              )}
            </section>
          ) : (
            children
          )}
        </main>
      </div>
      <BarraInferior />
    </div>
  );
}
