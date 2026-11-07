import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obtenerSesion } from "@/lib/auth/contexto";
import { FormNegocio } from "../formularios";

export const metadata: Metadata = { title: "Bienvenida" };

export default async function Pagina() {
  const s = await obtenerSesion();
  if (s.estado === "anonimo") redirect("/login");
  if (s.estado === "listo") redirect("/dashboard");
  return (
    <div className="space-y-4">
      <h1 className="text-center text-xl font-semibold">Un último paso: tu negocio</h1>
      <FormNegocio />
    </div>
  );
}
