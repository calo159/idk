import type { Metadata } from "next";
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
      <FormLogin siguiente={siguiente} />
    </div>
  );
}
