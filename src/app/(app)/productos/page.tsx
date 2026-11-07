import type { Metadata } from "next";
import { Package } from "lucide-react";
import { PaginaVacia } from "@/components/layout/pagina-vacia";

export const metadata: Metadata = { title: "Productos" };

export default function Pagina() {
  return (
    <PaginaVacia
      titulo="Productos"
      descripcion="Catálogo con presentaciones, códigos de barras y fotos."
      icono={Package}
      tarea="1.3"
    />
  );
}
