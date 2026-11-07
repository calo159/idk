import type { Metadata } from "next";
import { FormRecuperar } from "../formularios";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function Pagina() {
  return (
    <div className="space-y-4">
      <h1 className="text-center text-xl font-semibold">Recupera tu contraseña</h1>
      <FormRecuperar />
    </div>
  );
}
