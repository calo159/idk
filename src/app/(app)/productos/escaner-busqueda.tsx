"use client";

import { useRouter } from "next/navigation";
import { EscanerCodigo } from "@/components/escaner-codigo";
import { buscarPorCodigo } from "./buscar";

/** Escanea y abre el producto; si no existe, ofrece buscarlo por el código. */
export function EscanerBusqueda() {
  const router = useRouter();
  return (
    <EscanerCodigo
      alLeer={async (codigo) => {
        const r = await buscarPorCodigo(codigo);
        if (r.ok && r.datos) router.push(`/productos/${r.datos.productoId}`);
        else router.push(`/productos?q=${encodeURIComponent(codigo)}`);
      }}
    />
  );
}
