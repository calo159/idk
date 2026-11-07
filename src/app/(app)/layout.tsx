import type { ReactNode } from "react";
import { cerrarSesion } from "@/app/(auth)/acciones";
import { BarraInferior } from "@/components/layout/barra-inferior";
import { BarraLateral } from "@/components/layout/barra-lateral";
import { Encabezado } from "@/components/layout/encabezado";
import { requerirContexto } from "@/lib/auth/contexto";
import { etiquetaRol } from "@/lib/permisos";

/** Estructura de las pantallas protegidas: lateral en escritorio, barra inferior en celular. */
export default async function LayoutApp({ children }: { children: ReactNode }) {
  const ctx = await requerirContexto();
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
        <main id="contenido" className="flex-1 pb-28 md:pb-8">
          {children}
        </main>
      </div>
      <BarraInferior />
    </div>
  );
}
