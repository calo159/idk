import type { Metadata } from "next";
import { Store } from "lucide-react";
import { PaginaVacia } from "@/components/layout/pagina-vacia";

export const metadata: Metadata = { title: "Proveedores" };

export default function Pagina() {
  return (
    <PaginaVacia
      titulo="Proveedores"
      descripcion="Proveedores e historial de precios de compra."
      icono={Store}
      tarea="1.6"
    />
  );
}
