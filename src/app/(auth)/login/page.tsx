import type { Metadata } from "next";
import { LimpiarCacheOffline } from "@/components/pwa/registrar-sw";
import { FormLogin } from "../formularios";

export const metadata: Metadata = { title: "Entrar" };

export default async function Pagina({
  searchParams,
}: {
  searchParams: Promise<{ siguiente?: string }>;
}) {
  const { siguiente } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-center text-xl font-semibold">Entra a tu negocio</h1>
      <LimpiarCacheOffline />
      <FormLogin siguiente={siguiente} />
    </div>
  );
}
