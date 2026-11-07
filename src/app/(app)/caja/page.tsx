import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { PaginaVacia } from "@/components/layout/pagina-vacia";

export const metadata: Metadata = { title: "Caja" };

export default function Pagina() {
  return (
    <PaginaVacia
      titulo="Caja"
      descripcion="Apertura de turno, arqueo por denominación y diferencia de caja."
      icono={Wallet}
      tarea="1.11"
    />
  );
}
