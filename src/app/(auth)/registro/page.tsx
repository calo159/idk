import type { Metadata } from "next";
import { FormRegistro } from "../formularios";

export const metadata: Metadata = { title: "Crear mi negocio" };

export default function Pagina() {
  return (
    <div className="space-y-4">
      <h1 className="text-center text-xl font-semibold">Crea tu negocio en 2 minutos</h1>
      <p className="text-center text-sm text-muted-foreground">Prueba gratis. Sin tarjeta.</p>
      <FormRegistro />
    </div>
  );
}
