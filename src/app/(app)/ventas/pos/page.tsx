import type { Metadata } from "next";
import { ShoppingCart } from "lucide-react";
import { PaginaVacia } from "@/components/layout/pagina-vacia";

export const metadata: Metadata = { title: "Vender" };

export default function Pagina() {
  return (
    <PaginaVacia
      titulo="Vender"
      descripcion="Punto de venta rápido: busca o escanea, cobra con pagos mixtos o a crédito."
      icono={ShoppingCart}
      tarea="1.9"
    />
  );
}
