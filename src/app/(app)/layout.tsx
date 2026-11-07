import type { ReactNode } from "react";
import { BarraInferior } from "@/components/layout/barra-inferior";
import { BarraLateral } from "@/components/layout/barra-lateral";
import { Encabezado } from "@/components/layout/encabezado";

/**
 * Estructura de las pantallas protegidas: lateral en escritorio, barra inferior en celular.
 * (La protección por sesión y el nombre real del negocio llegan con la tarea 1.1.)
 */
export default function LayoutApp({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <BarraLateral />
      <div className="flex min-w-0 flex-1 flex-col">
        <Encabezado />
        <main id="contenido" className="flex-1 pb-28 md:pb-8">
          {children}
        </main>
      </div>
      <BarraInferior />
    </div>
  );
}
