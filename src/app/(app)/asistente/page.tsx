import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requerirContexto } from "@/lib/auth/contexto";
import { EJEMPLOS } from "@/server/asistente/asistente";
import { Chat } from "./chat";

export const metadata: Metadata = { title: "Asistente" };

export default async function Pagina() {
  const ctx = await requerirContexto();
  if (ctx.rol !== "dueno" && ctx.rol !== "admin" && ctx.rol !== "contador") redirect("/dashboard");
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Pregúntale a tu negocio</h1>
      <p className="text-sm text-muted-foreground">Escribe como hablas: «¿cuánto vendí este mes?», «¿quién me debe más?», «¿qué se me está quedando parado?».</p>
      <Chat ejemplos={EJEMPLOS} />
    </section>
  );
}
