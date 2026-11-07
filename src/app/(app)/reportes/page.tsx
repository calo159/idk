import type { Metadata } from "next";
import { ChartColumn } from "lucide-react";
import { PaginaVacia } from "@/components/layout/pagina-vacia";

export const metadata: Metadata = { title: "Reportes" };

export default function Pagina() {
  return (
    <PaginaVacia
      titulo="Reportes"
      descripcion="Ventas por día, producto, vendedor y método de pago."
      icono={ChartColumn}
      tarea="1.15"
    />
  );
}
