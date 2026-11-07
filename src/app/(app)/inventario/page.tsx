import type { Metadata } from "next";
import { Boxes } from "lucide-react";
import { PaginaVacia } from "@/components/layout/pagina-vacia";

export const metadata: Metadata = { title: "Inventario" };

export default function Pagina() {
  return (
    <PaginaVacia
      titulo="Inventario"
      descripcion="Existencias por bodega, kardex de cada producto y ajustes con motivo."
      icono={Boxes}
      tarea="1.5"
    />
  );
}
