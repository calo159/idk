import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PaginaVacia } from "@/components/layout/pagina-vacia";

export const metadata: Metadata = { title: "Clientes" };

export default function Pagina() {
  return (
    <PaginaVacia
      titulo="Clientes"
      descripcion="Clientes con cupo de crédito, saldo y abonos."
      icono={Users}
      tarea="1.8"
    />
  );
}
