import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { puedeEscribir } from "@/lib/permisos";
import { LectorCuaderno } from "./lector";

export const metadata: Metadata = { title: "Cargar desde el cuaderno" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "productos") || !ctx.bodegaId) redirect("/productos");
  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <Link href="/productos" className="text-sm text-muted-foreground underline">← Productos</Link>
      <h1 className="text-xl font-semibold">Cargar desde el cuaderno</h1>
      <p className="text-sm text-muted-foreground">
        Tómale una foto a tu cuaderno de inventario o de fiados. Detectamos los productos con sus cantidades y las deudas de tus clientes; tú revisas antes de cargar nada.
      </p>
      <LectorCuaderno bodegaId={ctx.bodegaId} puedeDeudas={ctx.rol === "dueno" || ctx.rol === "admin"} />
    </section>
  );
}
