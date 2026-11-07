import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { PaginaVacia } from "@/components/layout/pagina-vacia";

export const metadata: Metadata = { title: "Configuración" };

export default function Pagina() {
  return (
    <PaginaVacia
      titulo="Configuración"
      descripcion="Datos del negocio, usuarios, roles y preferencias."
      icono={Settings}
      tarea="1.2"
    />
  );
}
