import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { puedeEscribir } from "@/lib/permisos";
import { Importador } from "./importador";

export const metadata: Metadata = { title: "Importar productos" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "productos") || !ctx.bodegaId) redirect("/productos");
  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <Link href="/productos" className="text-sm text-muted-foreground underline">
        ← Productos
      </Link>
      <h1 className="text-xl font-semibold">Importar desde Excel</h1>
      <p className="text-sm text-muted-foreground">
        Sube tu lista de productos tal como la tienes. Detectamos qué es cada columna y tú confirmas antes de importar.
        Solo se envían los títulos de las columnas y unas pocas filas de ejemplo para reconocerlas.
      </p>
      <Importador bodegaId={ctx.bodegaId} />
    </section>
  );
}
