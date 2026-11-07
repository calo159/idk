import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { PaginaVacia } from "@/components/layout/pagina-vacia";

export const metadata: Metadata = { title: "Inicio" };

export default function Pagina() {
  return (
    <PaginaVacia
      titulo="Inicio"
      descripcion="Aquí verás las ventas de hoy, la utilidad, la caja y las alertas de tu negocio."
      icono={LayoutDashboard}
      tarea="1.15"
    />
  );
}
