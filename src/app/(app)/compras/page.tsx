import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { PaginaVacia } from "@/components/layout/pagina-vacia";

export const metadata: Metadata = { title: "Compras" };

export default function Pagina() {
  return (
    <PaginaVacia
      titulo="Compras"
      descripcion="Registra compras a proveedores o súbelas con la foto de la factura."
      icono={Truck}
      tarea="1.6"
    />
  );
}
