"use client";

import { useTransition } from "react";
import { cancelarCotizacion } from "./acciones";

export function BotonCancelarCotizacion({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button type="button" disabled={pendiente} className="text-destructive underline"
      onClick={() => { if (window.confirm("¿Cancelar esta cotización?")) iniciar(async () => void (await cancelarCotizacion(id))); }}>
      Cancelar
    </button>
  );
}
