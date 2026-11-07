"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { anularTraslado } from "./acciones";

export function BotonAnularTraslado({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        disabled={pendiente}
        onClick={() => {
          const motivo = window.prompt("¿Por qué se anula este traslado?");
          if (!motivo) return;
          iniciar(async () => {
            const r = await anularTraslado(id, motivo);
            setError(r.ok ? null : r.error);
          });
        }}
      >
        Anular traslado
      </Button>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
