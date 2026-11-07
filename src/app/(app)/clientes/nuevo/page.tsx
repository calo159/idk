import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { puede, puedeEscribir } from "@/lib/permisos";
import { FormCliente } from "../formularios";

export const metadata: Metadata = { title: "Nuevo cliente" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (!puedeEscribir(ctx.rol, "clientes")) redirect("/clientes");
  return (
    <section className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <Link href="/clientes" className="text-sm text-muted-foreground underline">
        ← Clientes
      </Link>
      <h1 className="text-xl font-semibold">Nuevo cliente</h1>
      <FormCliente puedeCupo={puede(ctx.rol, "clientes.cupo")} />
    </section>
  );
}
