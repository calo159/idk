"use client";

import { useState, useTransition } from "react";
import { rechazarPedido } from "./acciones";

export function BotonRechazarPedido({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button type="button" disabled={pendiente} className="text-xs text-destructive underline"
        onClick={() => {
          const motivo = window.prompt("¿Por qué no se puede atender? (se lo enviamos al cliente)");
          if (!motivo) return;
          iniciar(async () => { const r = await rechazarPedido(id, motivo); setError(r.ok ? null : r.error); });
        }}>
        Rechazar
      </button>
      {error ? <span role="alert" className="block text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
