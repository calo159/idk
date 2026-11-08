import type { Metadata } from "next";
import { FormRegistro } from "../formularios";

export const metadata: Metadata = { title: "Crear mi negocio" };

export default async function Pagina({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-center text-xl font-semibold">Crea tu negocio en 2 minutos</h1>
      <p className="text-center text-sm text-muted-foreground">Prueba gratis. Sin tarjeta.</p>
      <FormRegistro referido={/^SURT-[A-HJ-NP-Z2-9]{6}$/i.test(ref ?? "") ? ref!.toUpperCase() : undefined} />
    </div>
  );
}
