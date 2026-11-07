import type { Metadata } from "next";
import { ShoppingCart } from "lucide-react";
import { PaginaVacia } from "@/components/layout/pagina-vacia";

export const metadata: Metadata = { title: "Historial de ventas" };

export default function Pagina() {
  return (
    <PaginaVacia
      titulo="Historial de ventas"
      descripcion="Consulta y anula ventas con motivo y auditoría."
      icono={ShoppingCart}
      tarea="1.12"
    />
  );
}
